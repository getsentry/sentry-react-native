package io.sentry.react;

import com.facebook.react.bridge.Promise;

import android.os.Handler;
import android.os.Looper;
import android.view.Choreographer;

import org.jetbrains.annotations.NotNull;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.android.core.SentryAndroidDateProvider;

public class RNSentryTimeToDisplay {
    public static void GetTimeToDisplay(Promise promise, SentryDateProvider dateProvider) {
        Looper mainLooper = Looper.getMainLooper();

        if (mainLooper == null) {
            promise.reject("GetTimeToDisplay is not able to measure the time to display: Main looper not available.");
            return;
        }
        
        // Ensure the code runs on the main thread
        new Handler(mainLooper)
            .post(() -> {
                try {
                    Choreographer choreographer = Choreographer.getInstance();

                    // Invoke the callback after the frame is rendered
                    choreographer.postFrameCallback(frameTimeNanos -> {
                        final SentryDate endDate = dateProvider.now();
                        promise.resolve(endDate.nanoTimestamp() / 1e9);
                    });
                } catch (Exception exception) {
                    promise.reject("Failed to receive the instance of Choreographer", exception);
                }
            });
    }
}
