package io.sentry.react;

import io.sentry.ILogger;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
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
  interface JSThreadScheduler {
    /** Returns false when the runnable could not be scheduled, for example without a JS thread. */
    boolean schedule(@NotNull Runnable runnable);
  }

  interface Sampler {
    /** Samples the JS thread and returns the Hermes trace, or null. An interrupt ends it early. */
    @Nullable
    String sample(long durationMs);
  }

  interface Capturer {
    void capture(@NotNull SentryEvent event);
  }

  interface PauseCondition {
    /** Returns true while the app is in the background or a debugger is attached. */
    boolean isPaused();
  }

  static final long POLL_INTERVAL_MS = 100;
  static final long STACK_SAMPLE_WINDOW_MS = 300;
  static final String BUNDLE_FILE_NAME = "app:///index.android.bundle";

  private final @NotNull JSThreadScheduler scheduler;
  private final @NotNull Sampler sampler;
  private final @NotNull Capturer capturer;
  private final @NotNull PauseCondition pauseCondition;
  private final @NotNull ILogger logger;
  private @Nullable Thread thread;

  RNSentryJSHangTracker(
      final @NotNull JSThreadScheduler scheduler,
      final @NotNull Sampler sampler,
      final @NotNull Capturer capturer,
      final @NotNull PauseCondition pauseCondition,
      final @NotNull ILogger logger) {
    this.scheduler = scheduler;
    this.sampler = sampler;
    this.capturer = capturer;
    this.pauseCondition = pauseCondition;
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
   * Stops tracking, ends a running Hermes sample, and waits until the tracker thread ends, so the
   * sampler is off before React Native destroys the JS thread.
   */
  synchronized void stop() {
    final @Nullable Thread oldThread = thread;
    thread = null;
    if (oldThread == null) {
      return;
    }
    oldThread.interrupt();
    boolean interrupted = false;
    // The tracker thread never waits for the caller or for the capture, so it ends soon.
    while (oldThread.isAlive()) {
      try {
        oldThread.join();
      } catch (InterruptedException e) {
        interrupted = true;
      }
    }
    if (interrupted) {
      Thread.currentThread().interrupt();
    }
  }

  synchronized boolean isRunning() {
    return thread != null;
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
        if (pauseCondition.isPaused()) {
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
          if (!schedule(pong)) {
            // A new JS runtime must answer again before the tracker measures.
            inFlight.set(false);
            armed.set(false);
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
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      logger.log(SentryLevel.WARNING, "JS hang tracker stopped.", e);
    }
  }

  private boolean schedule(final @NotNull Runnable runnable) {
    try {
      return scheduler.schedule(runnable);
    } catch (Throwable e) { // NOPMD - The JS thread does not exist yet or anymore.
      return false;
    }
  }

  private void reportHang(final long timeoutIntervalMs, final @Nullable String bundleDebugId) {
    final @Nullable String trace = sampler.sample(STACK_SAMPLE_WINDOW_MS);
    if (Thread.currentThread().isInterrupted()) {
      return;
    }
    try {
      final List<SentryStackFrame> frames =
          trace != null ? framesFromHermesTrace(trace) : Collections.emptyList();
      capturer.capture(createEvent(timeoutIntervalMs, frames, bundleDebugId));
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      logger.log(SentryLevel.WARNING, "Failed to report JS thread hang.", e);
    }
  }

  /**
   * Returns the JS frames of the first sample with JS frames, from the caller to the callee. The
   * sample starts at the hang, and the JS thread can recover during the window, so the oldest JS
   * stack is the hang.
   */
  static @NotNull List<SentryStackFrame> framesFromHermesTrace(final @NotNull String trace) {
    try {
      final JSONObject profile = new JSONObject(trace);
      final @Nullable JSONArray samples = profile.optJSONArray("samples");
      final @Nullable JSONObject stackFrames = profile.optJSONObject("stackFrames");
      if (samples == null || stackFrames == null) {
        return Collections.emptyList();
      }
      for (int i = 0; i < samples.length(); i++) {
        final @Nullable JSONObject sample = samples.optJSONObject(i);
        if (sample == null) {
          continue;
        }
        final List<SentryStackFrame> frames = framesFromFrameId(sample.opt("sf"), stackFrames);
        if (!frames.isEmpty()) {
          return frames;
        }
      }
      return Collections.emptyList();
    } catch (JSONException | RuntimeException e) {
      return Collections.emptyList();
    }
  }

  private static @NotNull List<SentryStackFrame> framesFromFrameId(
      @Nullable Object frameId, final @NotNull JSONObject stackFrames) {
    // Hermes links each frame to its caller, so the walk goes from the top frame to the root.
    final List<SentryStackFrame> frames = new ArrayList<>();
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
  }

  static @Nullable SentryStackFrame frameFromHermesFrame(final @NotNull JSONObject hermesFrame) {
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
    // The app recovers from a hang, so like an ANR the event is handled and does not mark the
    // session as crashed.
    final Mechanism mechanism = new Mechanism();
    mechanism.setType("JSHang");
    mechanism.setHandled(true);

    // The value uses the timeout and not the measured time, so events without a stack trace group
    // together.
    final SentryException exception = new SentryException();
    exception.setType("JS Thread Hang");
    exception.setValue("JS thread blocked for at least " + timeoutIntervalMs + " ms.");
    exception.setMechanism(mechanism);
    exception.setThreadId(0L);

    // A thread of its own keeps the native SDK from attaching the native threads, which do not
    // show the JS code.
    final SentryThread thread = new SentryThread();
    thread.setId(0L);
    thread.setName("JavaScript");
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
