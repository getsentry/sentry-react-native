package io.sentry.react;

import android.app.Application;

import androidx.annotation.Nullable;

public final class RNSentryReact {
    private static RNSentryReact instance;

    private @Nullable Application application;
    private @Nullable RNSentryReactActivityLifecycleTracer activityLifecycleTracer;

    private RNSentryReact() {}

    public static synchronized RNSentryReact getInstance() {
        if (instance == null) {
            instance = new RNSentryReact();
        }
        return instance;
    }

    public static void init(Application application) {
        RNSentryReact sentryReact = RNSentryReact.getInstance();
        sentryReact.setApplication(application);
        sentryReact.activityLifecycleTracer = new RNSentryReactActivityLifecycleTracer(application);
    }

    private void setApplication(@Nullable Application application) {
        this.application = application;
    }

    public @Nullable Application getApplication() {
        return this.application;
    }

    public @Nullable RNSentryReactActivityLifecycleTracer getActivityLifecycleTracer() {
        return this.activityLifecycleTracer;
    }
}
