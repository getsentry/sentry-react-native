package io.sentry.react;

import com.facebook.react.bridge.Promise;

import android.view.Choreographer;

import org.jetbrains.annotations.NotNull;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.android.core.SentryAndroidDateProvider;

public class RNSentryTimeToDisplay {
    public static void GetTimeToDisplay(Promise promise, SentryDateProvider dateProvider) {
        try {
            Choreographer choreographer = Choreographer.getInstance();

            // Invoke the callback after the frame is rendered
            choreographer.postFrameCallback(frameTimeNanos -> {
                final SentryDate endDate = dateProvider.now();

                promise.resolve(endDate.nanoTimestamp() / 1e9);
            });
        }
        catch (Exception exception) {
            promise.reject("Failed to receive the instance of Choreographer" ,exception);
        }
    }
}
