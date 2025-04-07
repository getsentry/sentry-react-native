package io.sentry.react

import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.common.JavascriptException
import io.sentry.Breadcrumb
import io.sentry.ILogger
import io.sentry.android.core.SentryAndroidOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.Mockito.mock

@RunWith(JUnit4::class)
class RNSentryModuleImplTest {
    private lateinit var module: RNSentryModuleImpl
    private lateinit var logger: ILogger

    @Before
    fun setUp() {
        logger = mock(ILogger::class.java)

        module = Utils.createRNSentryModuleWithMockedContext()
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
        module.getSentryAndroidOptions(actualOptions, options, logger)
        assert(actualOptions.isEnableSpotlight)
        assertEquals("http://localhost:8969/teststream", actualOptions.spotlightConnectionUrl)
    }

    @Test
    fun `when the spotlight url is passed, the spotlight is enabled for the given url`() {
        val options = JavaOnlyMap.of("spotlight", "http://localhost:8969/teststream")
        val actualOptions = SentryAndroidOptions()
        module.getSentryAndroidOptions(actualOptions, options, logger)
        assert(actualOptions.isEnableSpotlight)
        assertEquals("http://localhost:8969/teststream", actualOptions.spotlightConnectionUrl)
    }

    @Test
    fun `when the spotlight option is disabled, the spotlight SentryAndroidOption is set to false`() {
        val options = JavaOnlyMap.of("spotlight", false)
        val actualOptions = SentryAndroidOptions()
        module.getSentryAndroidOptions(actualOptions, options, logger)
        assertFalse(actualOptions.isEnableSpotlight)
    }

    @Test
    fun `the JavascriptException is added to the ignoredExceptionsForType list on initialisation`() {
        val actualOptions = SentryAndroidOptions()
        module.getSentryAndroidOptions(actualOptions, JavaOnlyMap.of(), logger)
        assertTrue(actualOptions.ignoredExceptionsForType.contains(JavascriptException::class.java))
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
        module.getSentryAndroidOptions(options, rnOptions, logger)

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
        module.getSentryAndroidOptions(options, rnOptions, logger)

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
        module.getSentryAndroidOptions(options, rnOptions, logger)

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
        module.getSentryAndroidOptions(options, JavaOnlyMap(), logger)

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
        module.getSentryAndroidOptions(options, rnOptions, logger)

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
        module.getSentryAndroidOptions(options, rnOptions, logger)

        val breadcrumb =
            Breadcrumb().apply {
                type = "http"
                setData("url", "http://testurl.com/service")
            }

        val result = options.beforeBreadcrumb?.execute(breadcrumb, mock())

        assertEquals(breadcrumb, result)
    }
}
