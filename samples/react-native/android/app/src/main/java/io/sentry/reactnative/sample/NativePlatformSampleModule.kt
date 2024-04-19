package io.sentry.reactnative.sample

import com.facebook.fbreact.specs.NativePlatformSampleModuleSpec
import com.facebook.react.bridge.ReactApplicationContext

class NativePlatformSampleModule(reactContext: ReactApplicationContext) : NativePlatformSampleModuleSpec(reactContext) {

    override fun getName() = NAME

    override fun crashOrString(): String {
        throw RuntimeException("JVM Crash in NativePlatformSampleModule.crashOrString()")
    }

    companion object {
        const val NAME = "NativePlatformSampleModule"
    }
}
