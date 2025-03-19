package io.sentry.react;

import android.os.Handler;
import android.os.Looper;
import android.view.Choreographer;
import com.facebook.react.bridge.Promise;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import java.util.LinkedHashMap;
import java.util.Map;

public final class RNSentryTimeToDisplay {

  private RNSentryTimeToDisplay() {}

  private static final int ENTRIES_MAX_SIZE = 50;
  private static final Map<String, Double> screenIdToRenderDuration =
      new LinkedHashMap<>(ENTRIES_MAX_SIZE + 1, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Double> eldest) {
          return size() > ENTRIES_MAX_SIZE;
        }
      };

  public static Double popTimeToDisplayFor(String screenId) {
    return screenIdToRenderDuration.remove(screenId);
  }

  public static void putTimeToDisplayFor(String screenId, Double value) {
    screenIdToRenderDuration.put(screenId, value);
  }

  public static void getTimeToDisplay(Promise promise, SentryDateProvider dateProvider) {
    Looper mainLooper = Looper.getMainLooper();

    if (mainLooper == null) {
      promise.reject(
          "GetTimeToDisplay is not able to measure the time to display: Main looper not"
              + " available.");
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
                      promise.resolve(endDate.nanoTimestamp() / 1e9);
                    });
              } catch (Exception exception) {
                promise.reject("Failed to receive the instance of Choreographer", exception);
              }
            });
  }
}
