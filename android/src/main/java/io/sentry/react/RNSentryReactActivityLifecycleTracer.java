package io.sentry.react;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

public final class RNSentryReactActivityLifecycleTracer {
    private static ActivityLifecycleCallbacks callbacks = new ActivityLifecycleCallbacks();

    public RNSentryReactActivityLifecycleTracer(Application application) {
        application.registerActivityLifecycleCallbacks(callbacks);
    }

    private static final class ActivityLifecycleCallbacks implements Application.ActivityLifecycleCallbacks {
        public void onActivityCreated(Activity activity, Bundle bundle) {
        }

        public void onActivityStarted(Activity activity) {
        }

        public void onActivityResumed(Activity activity) {
        }

        public void onActivityPaused(Activity activity) {
        }

        public void onActivityStopped(Activity activity) {
        }

        public void onActivitySaveInstanceState(Activity activity, Bundle bundle) {
        }

        public void onActivityDestroyed(Activity activity) {
        }
    }
}