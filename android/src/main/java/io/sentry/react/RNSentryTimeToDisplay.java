package io.sentry.react;

import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.view.Choreographer;

import androidx.annotation.NonNull;

import org.jetbrains.annotations.NotNull;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.android.core.SentryAndroidDateProvider;


public class RNSentryTimeToDisplay extends ReactContextBaseJavaModule {

    public static final String REACT_CLASS = "RNSentryTimeToDisplay";

    public RNSentryTimeToDisplay(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @ReactMethod
    public void requestAnimationFrame(Promise promise) {
        Choreographer choreographer = Choreographer.getInstance();

        // Invoke the callback after the frame is rendered
        choreographer.postFrameCallback(new Choreographer.FrameCallback() {
            @Override
            public void doFrame(long frameTimeNanos) {
                final @NotNull SentryDateProvider dateProvider = new SentryAndroidDateProvider();

                final SentryDate endDate = dateProvider.now();

                promise.resolve(endDate.nanoTimestamp() / 1e9);
            }
        });
    }
}
