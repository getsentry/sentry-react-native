package io.sentry.reactnative.sample

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import org.jetbrains.annotations.Nullable

class TurboSamplePackage : TurboReactPackage() {
    @Nullable
    override fun getModule(
        name: String,
        reactApplicationContext: ReactApplicationContext
    ): NativeModule? {
        return if (name == NativePlatformSampleModule.NAME) {
            NativePlatformSampleModule(reactApplicationContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> =
                HashMap()
            moduleInfos[NativePlatformSampleModule.NAME] = ReactModuleInfo(
                NativePlatformSampleModule.NAME,
                NativePlatformSampleModule.NAME,
                false,  // canOverrideExistingModule
                false,  // needsEagerInit
                true,  // hasConstants
                false,  // isCxxModule
                true // isTurboModule
            )
            moduleInfos
        }
    }
}
