package io.sentry.react;

import android.app.Application;

import androidx.annotation.Nullable;

public final class SentryReact {
    private static SentryReact instance;

    private @Nullable Application application;
    private @Nullable SentryReactActivityLifecycleTracer activityLifecycleTracer;

    private SentryReact() {}

    public static synchronized SentryReact getInstance() {
        if (instance == null) {
            instance = new SentryReact();
        }
        return instance;
    }

    public static void init(Application application) {
        SentryReact sentryReact = SentryReact.getInstance();
        sentryReact.setApplication(application);
        sentryReact.activityLifecycleTracer = new SentryReactActivityLifecycleTracer(application);
    }

    private void setApplication(@Nullable Application application) {
        this.application = application;
    }

    public @Nullable Application getApplication() {
        return this.application;
    }

    public @Nullable SentryReactActivityLifecycleTracer getActivityLifecycleTracer() {
        return this.activityLifecycleTracer;
    }
}
