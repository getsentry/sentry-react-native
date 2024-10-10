package io.sentry.react;

import com.facebook.react.bridge.Promise;

import android.view.Choreographer;

import org.jetbrains.annotations.NotNull;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.android.core.SentryAndroidDateProvider;

public class RNSentryTimeToDisplay {

    public void GetTimeToDisplay(Promise promise) {
        Choreographer choreographer = Choreographer.getInstance();

        // Invoke the callback after the frame is rendered
        choreographer.postFrameCallback(frameTimeNanos -> {
                final @NotNull SentryDateProvider dateProvider = new SentryAndroidDateProvider();

                final SentryDate endDate = dateProvider.now();

                promise.resolve(endDate.nanoTimestamp() / 1e9);
        });
    }
}
