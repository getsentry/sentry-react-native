package io.sentry.react;

import android.app.Application;

import androidx.annotation.Nullable;

public final class ReactSentry {
    private static ReactSentry instance;

    private @Nullable Application application;
    private @Nullable ReactSentryActivityLifecycleTracer activityLifecycleTracer;

    private ReactSentry() {}

    public static synchronized ReactSentry getInstance() {
        if (instance == null) {
            instance = new ReactSentry();
        }
        return instance;
    }

    public static void init(Application application) {
        ReactSentry reactSentry = ReactSentry.getInstance();
        reactSentry.setApplication(application);
        reactSentry.activityLifecycleTracer = new ReactSentryActivityLifecycleTracer(application);
    }

    private void setApplication(@Nullable Application application) {
        this.application = application;
    }

    public @Nullable Application getApplication() {
        return this.application;
    }

    public @Nullable ReactSentryActivityLifecycleTracer getActivityLifecycleTracer() {
        return this.activityLifecycleTracer;
    }
}
