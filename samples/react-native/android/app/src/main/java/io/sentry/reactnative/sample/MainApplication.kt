package io.sentry.reactnative.sample

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import io.sentry.react.RNSentrySDK

class MainApplication :
    Application(),
    ReactApplication {
    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(
            context = applicationContext,
            packageList =
                PackageList(this).packages.apply {
                    add(SamplePackage())
                    add(TurboSamplePackage())
                },
        )
    }

    override fun onCreate() {
        super.onCreate()
        if (!BuildConfig.SENTRY_DISABLE_NATIVE_START) {
            RNSentrySDK.init(this)
        }

        // Check for crash-on-start intent for testing
        if (shouldCrashOnStart()) {
            throw RuntimeException("This was intentional test crash before JS started.")
        }

        loadReactNative(this)
    }

    private fun shouldCrashOnStart(): Boolean {
        // Check if crash flag file exists (for E2E testing)
        val crashFile = getFileStreamPath(".sentry_crash_on_start")
        if (crashFile.exists()) {
            // Delete the flag immediately so we only crash once
            // This allows the next launch to succeed and send the crash report
            crashFile.delete()
            return true
        }
        return false
    }
}
