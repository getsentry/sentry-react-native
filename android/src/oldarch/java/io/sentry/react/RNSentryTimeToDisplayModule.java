package io.sentry.react;

import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

import android.view.Choreographer;

import androidx.annotation.NonNull;

import org.jetbrains.annotations.NotNull;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.android.core.SentryAndroidDateProvider;


public class RNSentryTimeToDisplayModule extends ReactContextBaseJavaModule {

    private final RNSentryTimeToDisplayImpl impl;

    RNSentryTimeToDisplayModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.impl = new RNSentryTimeToDisplayImpl();
    }

    @Override
    @NonNull
    public String getName() {
        return RNSentryTimeToDisplayImpl.NAME;
    }

    @ReactMethod
    public void requestAnimationFrame(Promise promise) {
        this.impl.requestAnimationFrame(promise);
    }

    @ReactMethod(isBlockingSynchronousMethod = true)
    public boolean isAvailable() {
        return this.impl.isAvailable();
    }
}
