package io.sentry.reactnative.sample

import android.os.Build
import com.facebook.fbreact.specs.NativePlatformSampleModuleSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext

class NativePlatformSampleModule(
    reactContext: ReactApplicationContext,
) : NativePlatformSampleModuleSpec(reactContext) {
    override fun getName() = NAME

    override fun crashOrString(): String = throw RuntimeException("JVM Crash in NativePlatformSampleModule.crashOrString()")

    override fun getPlatform(promise: Promise) {
        promise.resolve("android ${Build.VERSION.RELEASE}")
    }

    companion object {
        const val NAME = "NativePlatformSampleModule"
    }
}
