package io.sentry.react

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import io.sentry.ILogger
import io.sentry.SentryLevel
import io.sentry.android.core.performance.AppStartMetrics
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentCaptor
import org.mockito.Captor
import org.mockito.MockedStatic
import org.mockito.Mockito.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockStatic
import org.mockito.Mockito.verify
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.clearInvocations
import org.mockito.kotlin.eq
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryAppStartTest {
    private lateinit var module: RNSentryModuleImpl
    private lateinit var promise: Promise
    private lateinit var logger: ILogger
    private lateinit var metrics: AppStartMetrics
    private lateinit var metricsDataBag: Map<String, Any>

    private var argumentsMock: MockedStatic<Arguments>? = null

    @Captor
    private lateinit var writableMapCaptor: ArgumentCaptor<WritableMap>

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)

        promise = mock(Promise::class.java)
        logger = mock(ILogger::class.java)

        metrics = AppStartMetrics()
        metrics.appStartTimeSpan.start()
        metrics.appStartTimeSpan.stop()
        metricsDataBag = mapOf()

        RNSentryModuleImpl.lastStartTimestampMs = -1

        module = Utils.createRNSentryModuleWithMockedContext()

        // Mock the Arguments class
        argumentsMock = mockStatic(Arguments::class.java)
        whenever(Arguments.createMap()).thenReturn(JavaOnlyMap())
    }

    @After
    fun tearDown() {
        argumentsMock?.close()
    }

    @Test
    fun `fetchNativeAppStart resolves promise with null when app is not launched in the foreground`() {
        val metrics = AppStartMetrics()
        metrics.isAppLaunchedInForeground = false

        val metricsDataBag = mapOf<String, Any>()

        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        verifyWarnOnceWith(
            logger,
            "Invalid app start data: app not launched in foreground.",
        )

        verify(promise).resolve(null)
    }

    @Test
    fun `fetchNativeAppStart resolves promise with app start data when app is launched in the foreground`() {
        metrics.isAppLaunchedInForeground = true

        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        verifyDebugOnceWith(logger, "App Start data reported to the RN layer for the first time.")

        val capturedMap = getWritableMapFromPromiseResolve(promise)
        assertEquals(false, capturedMap.getBoolean("has_fetched"))
    }

    @Test
    fun `fetchNativeAppStart marks data as fetched when retried multiple times`() {
        metrics.isAppLaunchedInForeground = true

        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        // Clear invocations from the first call
        clearInvocations(promise)
        clearInvocations(logger)
        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        verifyDebugOnceWith(logger, "App Start data already fetched from native before.")

        val capturedMap = getWritableMapFromPromiseResolve(promise)
        assertEquals(true, capturedMap.getBoolean("has_fetched"))
    }

    @Test
    fun `fetchNativeAppStart returns updated app start data as not fetched before`() {
        metrics.isAppLaunchedInForeground = true

        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        // Clear invocations from the first call
        clearInvocations(promise)
        clearInvocations(logger)

        metrics.onAppStartSpansSent()
        metrics.appStartTimeSpan.setStartUnixTimeMs(1741691014000)
        metrics.appStartTimeSpan.stop()
        module.fetchNativeAppStart(promise, metrics, metricsDataBag, logger)

        verifyDebugOnceWith(logger, "App Start data updated, reporting to the RN layer again.")

        val capturedMap = getWritableMapFromPromiseResolve(promise)
        assertEquals(false, capturedMap.getBoolean("has_fetched"))
    }

    private fun getWritableMapFromPromiseResolve(promise: Promise): WritableMap {
        verify(promise).resolve(any(WritableMap::class.java))
        verify(promise).resolve(writableMapCaptor.capture())
        return writableMapCaptor.value
    }

    private fun verifyWarnOnceWith(
        logger: ILogger,
        value: String,
    ) {
        verify(
            logger,
            org.mockito.kotlin.times(1),
        ).log(eq(SentryLevel.WARNING), eq(value))
    }

    private fun verifyDebugOnceWith(
        logger: ILogger,
        value: String,
    ) {
        verify(
            logger,
            org.mockito.kotlin.times(1),
        ).log(eq(SentryLevel.DEBUG), eq(value))
    }
}
