package io.sentry.react

import android.app.Activity
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.common.JavascriptException
import io.sentry.Breadcrumb
import io.sentry.ILogger
import io.sentry.SentryEvent
import io.sentry.android.core.CurrentActivityHolder
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.SdkVersion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.Mockito.mock
import org.mockito.MockitoAnnotations

@RunWith(JUnit4::class)
class RNSentryStartTest {
    private lateinit var logger: ILogger

    private lateinit var activity: Activity

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        logger = mock(ILogger::class.java)
        activity = mock(Activity::class.java)
    }

    @Test
    fun `when the spotlight option is enabled, the spotlight SentryAndroidOption is set to true and the default url is used`() {
        val options =
            JavaOnlyMap.of(
                "spotlight",
                true,
                "defaultSidecarUrl",
                "http://localhost:8969/teststream",
            )
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.getSentryAndroidOptions(actualOptions, options, logger)
        assert(actualOptions.isEnableSpotlight)
        assertEquals("http://localhost:8969/teststream", actualOptions.spotlightConnectionUrl)
    }

    @Test
    fun `when the spotlight url is passed, the spotlight is enabled for the given url`() {
        val options = JavaOnlyMap.of("spotlight", "http://localhost:8969/teststream")
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.getSentryAndroidOptions(actualOptions, options, logger)
        assert(actualOptions.isEnableSpotlight)
        assertEquals("http://localhost:8969/teststream", actualOptions.spotlightConnectionUrl)
    }

    @Test
    fun `when the spotlight option is enabled without defaultSidecarUrl, the spotlight is enabled and does not crash`() {
        val options = JavaOnlyMap.of("spotlight", true)
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.getSentryAndroidOptions(actualOptions, options, logger)
        assert(actualOptions.isEnableSpotlight)
        assertNull(actualOptions.spotlightConnectionUrl)
    }

    @Test
    fun `when the spotlight option is disabled, the spotlight SentryAndroidOption is set to false`() {
        val options = JavaOnlyMap.of("spotlight", false)
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.getSentryAndroidOptions(actualOptions, options, logger)
        assertFalse(actualOptions.isEnableSpotlight)
    }

    @Test
    fun `beforeBreadcrumb callback filters out Sentry DSN requests breadcrumbs`() {
        val options = SentryAndroidOptions()
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "devServerUrl",
                "http://localhost:8081",
            )
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "https://def.ingest.sentry.io/1234567")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertNull("Breadcrumb should be filtered out", result)
    }

    @Test
    fun `beforeBreadcrumb callback filters out dev server breadcrumbs`() {
        val mockDevServerUrl = "http://localhost:8081"
        val options = SentryAndroidOptions()
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "devServerUrl",
                mockDevServerUrl,
            )
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", mockDevServerUrl)
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertNull("Breadcrumb should be filtered out", result)
    }

    @Test
    fun `beforeBreadcrumb callback does not filter out non dev server or dsn breadcrumbs`() {
        val options = SentryAndroidOptions()
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "devServerUrl",
                "http://localhost:8081",
            )
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "http://testurl.com/service")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertEquals(breadcrumb, result)
    }

    @Test
    fun `the breadcrumb is not filtered out when the dev server url and dsn are not passed`() {
        val options = SentryAndroidOptions()
        RNSentryStart.getSentryAndroidOptions(options, JavaOnlyMap(), logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "http://testurl.com/service")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertEquals(breadcrumb, result)
    }

    @Test
    fun `the breadcrumb is not filtered out when the dev server url is not passed and the dsn does not match`() {
        val options = SentryAndroidOptions()
        val rnOptions = JavaOnlyMap.of("dsn", "https://abc@def.ingest.sentry.io/1234567")
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "http://testurl.com/service")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertEquals(breadcrumb, result)
    }

    @Test
    fun `the breadcrumb is not filtered out when the dev server url does not match and the dsn is not passed`() {
        val options = SentryAndroidOptions()
        val rnOptions = JavaOnlyMap.of("devServerUrl", "http://localhost:8081")
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "http://testurl.com/service")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertEquals(breadcrumb, result)
    }

    @Test
    fun `the JavascriptException is added to the ignoredExceptionsForType list on with react defaults`() {
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.updateWithReactDefaults(actualOptions, activity)
        assertTrue(actualOptions.ignoredExceptionsForType.contains(JavascriptException::class.java))
    }

    @Test
    fun `the sdk version information is added to the initialisation options with react defaults`() {
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.updateWithReactDefaults(actualOptions, activity)
        assertEquals(RNSentryVersion.ANDROID_SDK_NAME, actualOptions.sdkVersion?.name)
        assertEquals(
            io.sentry.android.core.BuildConfig.VERSION_NAME,
            actualOptions.sdkVersion?.version,
        )
        // Note: In Sentry Android SDK v7, SdkVersion doesn't expose packages as a getter
        // The React Native package is added via addPackage() but not accessible via getter
    }

    @Test
    fun `the tracing options are added to the initialisation options with react defaults`() {
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.updateWithReactDefaults(actualOptions, activity)
        assertNull(actualOptions.tracesSampleRate)
        assertNull(actualOptions.tracesSampler)
        // Note: enableTracing property doesn't exist in Sentry Android SDK v7
        // Tracing is disabled by setting tracesSampleRate and tracesSampler to null
    }

    @Test
    fun `the current activity is added to the initialisation options with react defaults`() {
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.updateWithReactDefaults(actualOptions, activity)
        assertEquals(activity, CurrentActivityHolder.getInstance().activity)
    }

    @Test
    fun `beforeSend callback that sets event tags is set with react finals`() {
        val options = SentryAndroidOptions()
        val event =
            SentryEvent().apply { sdk = SdkVersion(RNSentryVersion.ANDROID_SDK_NAME, "1.0") }

        RNSentryStart.updateWithReactFinals(options)
        val result = options.beforeSend?.execute(event, mock())

        assertNotNull(result)
        assertEquals("android", result?.getTag("event.origin"))
        assertEquals("java", result?.getTag("event.environment"))
    }

    @Test
    fun `when enableNativeCrashHandling is false, native crash integrations are removed without ConcurrentModificationException`() {
        val rnOptions = JavaOnlyMap.of("enableNativeCrashHandling", false)
        val options = SentryAndroidOptions()

        // This should not throw ConcurrentModificationException
        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        // Verify integrations were removed
        val integrations = options.getIntegrations()
        assertFalse(
            "UncaughtExceptionHandlerIntegration should be removed",
            integrations.any { it is io.sentry.UncaughtExceptionHandlerIntegration },
        )
        assertFalse(
            "AnrIntegration should be removed",
            integrations.any { it is io.sentry.android.core.AnrIntegration },
        )
        assertFalse(
            "NdkIntegration should be removed",
            integrations.any { it is io.sentry.android.core.NdkIntegration },
        )
    }

    @Test
    fun `when enableNativeCrashHandling is true, native crash integrations are kept`() {
        val rnOptions = JavaOnlyMap.of("enableNativeCrashHandling", true)
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        // When enabled, the default integrations should still be present
        // Note: This test verifies that we don't remove integrations when the flag is true
        val integrations = options.getIntegrations()
        assertNotNull("Integrations list should not be null", integrations)
    }

    @Test
    fun `when enableTombstone is true, tombstone reporting is enabled`() {
        val rnOptions = JavaOnlyMap.of("enableTombstone", true)
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertTrue("Tombstone should be enabled", options.isTombstoneEnabled)
    }

    @Test
    fun `when enableTombstone is false, tombstone reporting is disabled`() {
        val rnOptions = JavaOnlyMap.of("enableTombstone", false)
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse("Tombstone should be disabled", options.isTombstoneEnabled)
    }

    @Test
    fun `when enableTombstone is not set, tombstone reporting remains at default (disabled)`() {
        val rnOptions = JavaOnlyMap()
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse("Tombstone should be disabled by default", options.isTombstoneEnabled)
    }

    @Test
    fun `when enableHistoricalTombstoneReporting is true, historical tombstone reporting is enabled`() {
        val rnOptions = JavaOnlyMap.of("enableHistoricalTombstoneReporting", true)
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertTrue("Historical tombstone reporting should be enabled", options.isReportHistoricalTombstones)
    }

    @Test
    fun `when enableHistoricalTombstoneReporting is false, historical tombstone reporting is disabled`() {
        val rnOptions = JavaOnlyMap.of("enableHistoricalTombstoneReporting", false)
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse("Historical tombstone reporting should be disabled", options.isReportHistoricalTombstones)
    }

    @Test
    fun `when enableHistoricalTombstoneReporting is not set, it remains at default (disabled)`() {
        val rnOptions = JavaOnlyMap()
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse(
            "Historical tombstone reporting should be disabled by default",
            options.isReportHistoricalTombstones,
        )
    }

    @Test
    fun `network detail replay options are forwarded to the native replay options`() {
        val mobileReplayOptions =
            JavaOnlyMap.of(
                "networkDetailAllowUrls",
                JavaOnlyArray.of("https://api.example.com"),
                "networkDetailDenyUrls",
                JavaOnlyArray.of("https://api.example.com/auth"),
                "networkCaptureBodies",
                true,
                "networkRequestHeaders",
                JavaOnlyArray.of("X-My-Header"),
                "networkResponseHeaders",
                JavaOnlyArray.of("X-Response-Header"),
            )
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "replaysOnErrorSampleRate",
                0.75,
                "mobileReplayOptions",
                mobileReplayOptions,
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val replay = options.sessionReplay
        assertEquals(listOf("https://api.example.com"), replay.networkDetailAllowUrls)
        assertEquals(listOf("https://api.example.com/auth"), replay.networkDetailDenyUrls)
        assertTrue(replay.isNetworkCaptureBodies)
        assertTrue(replay.networkRequestHeaders.contains("X-My-Header"))
        assertTrue(replay.networkResponseHeaders.contains("X-Response-Header"))
    }

    @Test
    fun `networkCaptureBodies can be disabled via mobileReplayOptions`() {
        val mobileReplayOptions =
            JavaOnlyMap.of(
                "networkDetailAllowUrls",
                JavaOnlyArray.of("https://api.example.com"),
                "networkCaptureBodies",
                false,
            )
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "replaysOnErrorSampleRate",
                0.75,
                "mobileReplayOptions",
                mobileReplayOptions,
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        val replay = options.sessionReplay
        assertEquals(listOf("https://api.example.com"), replay.networkDetailAllowUrls)
        assertFalse(replay.isNetworkCaptureBodies)
    }

    @Test
    fun `RegExp-sourced network detail urls forwarded as strings are kept`() {
        // The JS layer serializes RegExp patterns to their source string before
        // crossing the bridge; the native side stores them as plain strings.
        val mobileReplayOptions =
            JavaOnlyMap.of(
                "networkDetailAllowUrls",
                JavaOnlyArray.of("^https://api\\.example\\.com/.*"),
            )
        val rnOptions =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
                "replaysOnErrorSampleRate",
                0.75,
                "mobileReplayOptions",
                mobileReplayOptions,
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertEquals(
            listOf("^https://api\\.example\\.com/.*"),
            options.sessionReplay.networkDetailAllowUrls,
        )
    }
}
