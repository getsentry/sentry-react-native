package io.sentry.react

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import com.facebook.react.bridge.ReactApplicationContext
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.mock
import org.mockito.kotlin.whenever

class Utils {
    companion object {
        fun makeReactContextMock(): ReactApplicationContext {
            val packageManager = mock(PackageManager::class.java)
            val packageInfo = mock(PackageInfo::class.java)

            val reactContext = mock(ReactApplicationContext::class.java)
            whenever(reactContext.packageManager).thenReturn(packageManager)
            whenever(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(packageInfo)

            return reactContext
        }

        fun createRNSentryModuleWithMockedContext(): RNSentryModuleImpl {
            RNSentryModuleImpl.lastStartTimestampMs = -1

            return RNSentryModuleImpl(makeReactContextMock())
        }
    }
}
