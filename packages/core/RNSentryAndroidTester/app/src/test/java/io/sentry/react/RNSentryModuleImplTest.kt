package io.sentry.react

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import io.sentry.ILogger
import io.sentry.SentryLevel
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentCaptor
import org.mockito.Captor
import org.mockito.MockedStatic
import org.mockito.Mockito.any
import org.mockito.Mockito.anyInt
import org.mockito.Mockito.anyString
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockStatic
import org.mockito.Mockito.verify
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.whenever

@RunWith(JUnit4::class)
class RNSentryModuleImplTest {
    private lateinit var module: RNSentryModuleImpl
    private lateinit var promise: Promise
    private lateinit var logger: ILogger
    private var argumentsMock: MockedStatic<Arguments>? = null

    @Captor
    private lateinit var writableMapCaptor: ArgumentCaptor<WritableMap>

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        val reactContext = mock(ReactApplicationContext::class.java)
        promise = mock(Promise::class.java)
        logger = mock(ILogger::class.java)
        val packageManager = mock(PackageManager::class.java)
        val packageInfo = mock(PackageInfo::class.java)

        whenever(reactContext.packageManager).thenReturn(packageManager)
        whenever(packageManager.getPackageInfo(anyString(), anyInt())).thenReturn(packageInfo)

        module = RNSentryModuleImpl(reactContext)

        // Mock the Arguments class
        argumentsMock = mockStatic(Arguments::class.java)
        val writableMap = mock(WritableMap::class.java)
        whenever(Arguments.createMap()).thenReturn(writableMap)
    }

    @After
    fun tearDown() {
        argumentsMock?.close()
    }

    @Test
    fun `fetchNativeAppStart resolves promise with null when app is not launched in the foreground`() {
        // Mock the app start measurement
        val appStartMeasurement = mapOf<String, Any>()

        // Call the method
        module.fetchNativeAppStart(promise, appStartMeasurement, logger, false)

        // Verify a warning log is emitted
        verify(logger, org.mockito.kotlin.times(1)).log(
            SentryLevel.WARNING,
            "Invalid app start data: app not launched in foreground.",
        )

        // Verify the promise is resolved with null
        verify(promise).resolve(null)
    }

    @Test
    fun `fetchNativeAppStart resolves promise with app start data when app is launched in the foreground`() {
        // Mock the app start measurement
        val appStartMeasurement = mapOf<String, Any>()

        // Call the method
        module.fetchNativeAppStart(promise, appStartMeasurement, logger, true)

        // Verify no logs are emitted
        verify(logger, org.mockito.kotlin.times(0)).log(any(), any())

        // Verify the promise is resolved with the expected data
        verify(promise).resolve(any(WritableMap::class.java))
        verify(promise).resolve(writableMapCaptor.capture())
        val capturedMap = writableMapCaptor.value
        assertEquals(false, capturedMap.getBoolean("has_fetched"))
    }
}
