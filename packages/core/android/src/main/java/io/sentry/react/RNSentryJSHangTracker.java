package io.sentry.react;

import android.os.Debug;
import com.facebook.react.bridge.ReactApplicationContext;
import io.sentry.ILogger;
import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.android.core.AppState;
import io.sentry.protocol.DebugImage;
import io.sentry.protocol.DebugMeta;
import io.sentry.protocol.Mechanism;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentryStackFrame;
import io.sentry.protocol.SentryStackTrace;
import io.sentry.protocol.SentryThread;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Reports the JS thread when it stays blocked, because no JS code can report it while it is
 * blocked.
 *
 * <p>A native thread posts an empty runnable to the JS thread and waits for it to run. When the
 * runnable does not run within the timeout, the tracker samples the JS stack with Hermes and
 * captures an error event.
 */
final class RNSentryJSHangTracker {
  private static final long POLL_INTERVAL_MS = 100;
  private static final long STACK_SAMPLE_WINDOW_MS = 300;
  private static final long STOP_TIMEOUT_MS = 1000;
  private static final String BUNDLE_FILE_NAME = "app:///index.android.bundle";

  private final @NotNull ReactApplicationContext reactContext;
  private final @NotNull ILogger logger;
  private @Nullable Thread thread;

  RNSentryJSHangTracker(
      final @NotNull ReactApplicationContext reactContext, final @NotNull ILogger logger) {
    this.reactContext = reactContext;
    this.logger = logger;
  }

  /** Starts tracking, or restarts it with the new values when it already runs. */
  synchronized void start(final long timeoutIntervalMs, final @Nullable String bundleDebugId) {
    stop();
    final Thread newThread =
        new Thread(() -> run(timeoutIntervalMs, bundleDebugId), "io.sentry.react.js-hang-tracker");
    newThread.setDaemon(true);
    thread = newThread;
    newThread.start();
  }

  /**
   * Stops tracking and waits until the tracker thread ends, so the Hermes sampler is disabled
   * before React Native destroys the JS thread.
   */
  synchronized void stop() {
    final @Nullable Thread oldThread = thread;
    thread = null;
    if (oldThread == null) {
      return;
    }
    oldThread.interrupt();
    try {
      oldThread.join(STOP_TIMEOUT_MS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private void run(final long timeoutIntervalMs, final @Nullable String bundleDebugId) {
    // The tracker measures only after the JS thread answered once, so loading the bundle is not
    // a hang.
    final AtomicBoolean inFlight = new AtomicBoolean(false);
    final AtomicBoolean armed = new AtomicBoolean(false);
    final AtomicLong sentAt = new AtomicLong(0);
    final Runnable pong =
        () -> {
          inFlight.set(false);
          armed.set(true);
        };
    final long timeoutNs = TimeUnit.MILLISECONDS.toNanos(timeoutIntervalMs);
    boolean reported = false;
    boolean paused = false;

    try {
      while (!Thread.currentThread().isInterrupted()) {
        if (Boolean.TRUE.equals(AppState.getInstance().isInBackground())
            || Debug.isDebuggerConnected()) {
          paused = true;
          Thread.sleep(POLL_INTERVAL_MS);
          continue;
        }
        if (paused) {
          paused = false;
          sentAt.set(System.nanoTime());
        }

        if (!inFlight.get()) {
          sentAt.set(System.nanoTime());
          inFlight.set(true);
          if (!postToJSThread(pong)) {
            inFlight.set(false);
          }
        }

        Thread.sleep(POLL_INTERVAL_MS);

        if (!inFlight.get()) {
          reported = false;
        } else if (!reported && armed.get() && System.nanoTime() - sentAt.get() >= timeoutNs) {
          reported = true;
          reportHang(timeoutIntervalMs, bundleDebugId);
        }
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private boolean postToJSThread(final @NotNull Runnable runnable) {
    try {
      return reactContext.runOnJSQueueThread(runnable);
    } catch (Throwable e) { // NOPMD - The JS thread does not exist yet or anymore.
      return false;
    }
  }

  private void reportHang(final long timeoutIntervalMs, final @Nullable String bundleDebugId) {
    try {
      final @Nullable String trace =
          RNSentryHermesSampler.sample(STACK_SAMPLE_WINDOW_MS, reactContext.getCacheDir());
      final List<SentryStackFrame> frames =
          trace != null ? framesFromHermesTrace(trace) : Collections.emptyList();
      Sentry.captureEvent(createEvent(timeoutIntervalMs, frames, bundleDebugId));
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      logger.log(SentryLevel.WARNING, "Failed to report JS thread hang.", e);
    }
  }

  static @NotNull List<SentryStackFrame> framesFromHermesTrace(final @NotNull String trace) {
    try {
      final JSONObject profile = new JSONObject(trace);
      final @Nullable JSONArray samples = profile.optJSONArray("samples");
      final @Nullable JSONObject stackFrames = profile.optJSONObject("stackFrames");
      if (samples == null || samples.length() == 0 || stackFrames == null) {
        return Collections.emptyList();
      }
      final @Nullable JSONObject lastSample = samples.optJSONObject(samples.length() - 1);
      if (lastSample == null) {
        return Collections.emptyList();
      }

      // Hermes links each frame to its caller, so the walk goes from the top frame to the root.
      final List<SentryStackFrame> frames = new ArrayList<>();
      @Nullable Object frameId = lastSample.opt("sf");
      for (int depth = 0;
          frameId != null && frameId != JSONObject.NULL && depth < stackFrames.length();
          depth++) {
        final @Nullable JSONObject hermesFrame = stackFrames.optJSONObject(String.valueOf(frameId));
        if (hermesFrame == null) {
          break;
        }
        final @Nullable SentryStackFrame frame = frameFromHermesFrame(hermesFrame);
        if (frame != null) {
          frames.add(frame);
        }
        frameId = hermesFrame.opt("parent");
      }
      Collections.reverse(frames);
      return frames;
    } catch (JSONException | NumberFormatException e) {
      return Collections.emptyList();
    }
  }

  private static @Nullable SentryStackFrame frameFromHermesFrame(
      final @NotNull JSONObject hermesFrame) {
    final @Nullable String name = hermesFrame.optString("name", null);
    if (!"JavaScript".equals(hermesFrame.optString("category"))
        || name == null
        || "[root]".equals(name)) {
      return null;
    }

    final SentryStackFrame frame = new SentryStackFrame();
    frame.setPlatform("javascript");
    frame.setFilename(BUNDLE_FILE_NAME);
    final int paren = name.indexOf('(');
    final String function = paren == -1 ? name : name.substring(0, paren);
    frame.setFunction(function.isEmpty() ? null : function);

    if (hermesFrame.has("funcVirtAddr") && hermesFrame.has("offset")) {
      // Hermes bytecode has one line, and its column is 0-based while Sentry's is 1-based.
      final long column =
          Long.parseLong(hermesFrame.optString("funcVirtAddr"))
              + Long.parseLong(hermesFrame.optString("offset"))
              + 1;
      frame.setLineno(1);
      frame.setColno((int) column);
    } else {
      if (hermesFrame.has("line")) {
        frame.setLineno(Integer.parseInt(hermesFrame.optString("line")));
      }
      if (hermesFrame.has("column")) {
        frame.setColno(Integer.parseInt(hermesFrame.optString("column")));
      }
    }
    return frame;
  }

  static @NotNull SentryEvent createEvent(
      final long timeoutIntervalMs,
      final @NotNull List<SentryStackFrame> frames,
      final @Nullable String bundleDebugId) {
    final Mechanism mechanism = new Mechanism();
    mechanism.setType("JSHang");
    mechanism.setHandled(false);

    // The value uses the timeout and not the measured time, so events without a stack trace group
    // together.
    final SentryException exception = new SentryException();
    exception.setType("JS Thread Hang");
    exception.setValue("JS thread blocked for at least " + timeoutIntervalMs + " ms.");
    exception.setMechanism(mechanism);
    exception.setThreadId(0L);

    final SentryThread thread = new SentryThread();
    thread.setId(0L);
    thread.setName("JavaScript");
    thread.setCrashed(true);
    thread.setCurrent(false);
    thread.setMain(false);

    if (!frames.isEmpty()) {
      final SentryStackTrace stacktrace = new SentryStackTrace(new ArrayList<>(frames));
      exception.setStacktrace(stacktrace);
      thread.setStacktrace(stacktrace);
    }

    final SentryEvent event = new SentryEvent();
    event.setLevel(SentryLevel.ERROR);
    event.setExceptions(Collections.singletonList(exception));
    event.setThreads(Collections.singletonList(thread));
    if (bundleDebugId != null) {
      final DebugImage bundle = new DebugImage();
      bundle.setType("sourcemap");
      bundle.setDebugId(bundleDebugId);
      bundle.setCodeFile(BUNDLE_FILE_NAME);
      final DebugMeta debugMeta = new DebugMeta();
      debugMeta.setImages(new ArrayList<>(Collections.singletonList(bundle)));
      event.setDebugMeta(debugMeta);
    }
    return event;
  }
}
