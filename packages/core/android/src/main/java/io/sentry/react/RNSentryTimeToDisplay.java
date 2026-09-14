package io.sentry.react;

import android.os.Handler;
import android.os.Looper;
import android.view.Choreographer;
import androidx.annotation.VisibleForTesting;
import com.facebook.react.bridge.Promise;
import io.sentry.ILogger;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.SentryLevel;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.jetbrains.annotations.Nullable;

public final class RNSentryTimeToDisplay {

  private RNSentryTimeToDisplay() {}

  public static final int ENTRIES_MAX_SIZE = 50;
  private static final Map<String, Double> screenIdToRenderDuration =
      new LinkedHashMap<String, Double>(ENTRIES_MAX_SIZE + 1, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Double> eldest) {
          return size() > ENTRIES_MAX_SIZE;
        }
      };

  /**
   * The active span id that is used to attribute the time to display to the active span in case of
   * a screen navigation where native time to display is not available to assign the span id
   * received from JS.
   */
  private static @Nullable String activeSpanId = null;

  public static void setActiveSpanId(@Nullable String spanId) {
    activeSpanId = spanId;
  }

  public static Double popTimeToDisplayFor(String screenId) {
    return screenIdToRenderDuration.remove(screenId);
  }

  public static void putTimeToInitialDisplayForActiveSpan(Double value) {
    if (activeSpanId != null) {
      putTimeToDisplayFor("ttid-navigation-" + activeSpanId, value);
    }
  }

  public static void putTimeToDisplayFor(String screenId, Double value) {
    screenIdToRenderDuration.put(screenId, value);
  }

  public static void getTimeToDisplay(
      Promise promise, SentryDateProvider dateProvider, ILogger logger) {
    // The promise is settled from a deferred Choreographer frame callback. Under rapid
    // navigation the bridge callback backing the promise may already have been settled or
    // invalidated by the runtime by the time the frame callback runs (on Expo bridgeless this
    // surfaces as "JavaCallback was already settled"). Settling it again throws, and because the
    // settle happens inside the frame callback the exception is uncaught and reaches the host app
    // as a fatal crash. Guard against settling more than once and swallow any settle failure -
    // dropping a late time-to-display measurement is the expected degradation here. (#6709)
    final AtomicBoolean settled = new AtomicBoolean(false);

    Looper mainLooper = Looper.getMainLooper();
    if (mainLooper == null) {
      rejectSafely(
          promise,
          settled,
          "GetTimeToDisplay is not able to measure the time to display: Main looper not available.",
          null,
          logger);
      return;
    }

    // Ensure the code runs on the main thread
    new Handler(mainLooper)
        .post(
            () -> {
              try {
                Choreographer choreographer = Choreographer.getInstance();

                // Invoke the callback after the frame is rendered
                choreographer.postFrameCallback(
                    frameTimeNanos -> {
                      final SentryDate endDate = dateProvider.now();
                      resolveSafely(promise, settled, endDate.nanoTimestamp() / 1e9, logger);
                    });
              } catch (Throwable exception) { // NOPMD - We don't want to crash the host app
                rejectSafely(
                    promise,
                    settled,
                    "Failed to receive the instance of Choreographer",
                    exception,
                    logger);
              }
            });
  }

  @VisibleForTesting
  static void resolveSafely(Promise promise, AtomicBoolean settled, double value, ILogger logger) {
    if (!settled.compareAndSet(false, true)) {
      return;
    }
    try {
      promise.resolve(value);
    } catch (Throwable t) { // NOPMD - We don't want to crash the host app
      logger.log(SentryLevel.WARNING, "Failed to resolve time to display measurement.", t);
    }
  }

  @VisibleForTesting
  static void rejectSafely(
      Promise promise,
      AtomicBoolean settled,
      String message,
      @Nullable Throwable cause,
      ILogger logger) {
    if (!settled.compareAndSet(false, true)) {
      return;
    }
    try {
      if (cause != null) {
        promise.reject(message, cause);
      } else {
        promise.reject(message);
      }
    } catch (Throwable t) { // NOPMD - We don't want to crash the host app
      logger.log(SentryLevel.WARNING, "Failed to reject time to display measurement.", t);
    }
  }
}
