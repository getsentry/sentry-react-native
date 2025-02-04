package io.sentry.react

import android.app.Activity
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
        assertEquals(true, actualOptions.sdkVersion?.packages?.isNotEmpty())
        assertEquals(
            RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_NAME,
            actualOptions.sdkVersion
                ?.packages
                ?.last()
                ?.name,
        )
        assertEquals(
            RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_VERSION,
            actualOptions.sdkVersion
                ?.packages
                ?.last()
                ?.version,
        )
    }

    @Test
    fun `the tracing options are added to the initialisation options with react defaults`() {
        val actualOptions = SentryAndroidOptions()
        RNSentryStart.updateWithReactDefaults(actualOptions, activity)
        assertNull(actualOptions.tracesSampleRate)
        assertNull(actualOptions.tracesSampler)
        assertEquals(false, actualOptions.enableTracing)
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
}
