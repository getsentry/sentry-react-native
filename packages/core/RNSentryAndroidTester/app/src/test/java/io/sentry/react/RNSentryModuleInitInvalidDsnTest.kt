package io.sentry.react

import androidx.test.core.app.ApplicationProvider
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryModuleInitInvalidDsnTest {
    // Parity with the iOS regression test: an invalid DSN must be rejected at the
    // bridge, not crash the host app. The Android SDK throws while parsing the DSN
    // during init; initNativeSdk catches it and rejects the promise.
    @Test
    fun `initNativeSdk rejects on an invalid DSN instead of crashing`() {
        val reactContext = Utils.makeReactContextMock()
        whenever(reactContext.applicationContext).thenReturn(ApplicationProvider.getApplicationContext())
        val module = RNSentryModuleImpl(reactContext)

        val rnOptions = JavaOnlyMap.of("dsn", "\$SOME_ENV_VAR")
        val promise = mock<Promise>()

        // Must not throw out of the bridge (that would crash the app).
        module.initNativeSdk(rnOptions, promise)

        verify(promise).reject(eq("SentryReactNative"), anyOrNull<String>(), any<Throwable>())
        verify(promise, never()).resolve(anyOrNull())
    }
}
