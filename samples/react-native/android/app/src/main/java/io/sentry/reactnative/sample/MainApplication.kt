package io.sentry.reactnative.sample

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.flipper.ReactNativeFlipper
import com.facebook.soloader.SoLoader
import io.sentry.Hint
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import io.sentry.SentryOptions.BeforeSendCallback
import io.sentry.android.core.SentryAndroid


class MainApplication() : Application(), ReactApplication {
    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    add(SamplePackage())
                    add(TurboSamplePackage())
                }

            override fun getJSMainModuleName(): String = "index"
            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        // When the native init is enabled the `autoInitializeNativeSdk`
        // in JS has to be set to `false`
        // this.initializeSentry()
        SoLoader.init(this, false)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            // If you opted-in for the New Architecture, we load the native entry point for this app.
            load()
        }
        ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
    }

    private fun initializeSentry() {
        SentryAndroid.init(this) { options ->
            // Only options set here will apply to the Android SDK
            // Options from JS are not passed to the Android SDK when initialized manually
            options.dsn = "https://1df17bd4e543fdb31351dee1768bb679@o447951.ingest.sentry.io/5428561"
            options.isDebug = true

            options.beforeSend = BeforeSendCallback { event: SentryEvent, hint: Hint? ->
                // React native internally throws a JavascriptException
                // Since we catch it before that, we don't want to send this one
                // because we would send it twice
                try {
                    val ex = event.exceptions!![0]
                    if (null != ex && ex.type!!.contains("JavascriptException")) {
                        return@BeforeSendCallback null
                    }
                } catch (ignored: Throwable) {
                    // We do nothing
                }

                event
            }
        }
    }
}
