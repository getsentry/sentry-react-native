package io.sentry.react

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.common.JavascriptException
import io.sentry.Hint
import io.sentry.ILogger
import io.sentry.Sentry
import io.sentry.Sentry.OptionsConfiguration
import io.sentry.SentryEvent
import io.sentry.android.core.AndroidLogger
import io.sentry.android.core.SentryAndroidOptions
import io.sentry.protocol.SdkVersion
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RNSentrySDKTest {
    private val logger: ILogger = AndroidLogger(RNSentrySDKTest::class.java.simpleName)
    private lateinit var context: Context

    companion object {
        private const val INITIALISATION_ERROR = "Failed to initialize Sentry's React Native SDK"
        private const val VALID_OPTIONS = "sentry.options.json"
        private const val INVALID_OPTIONS = "invalid.options.json"
        private const val INVALID_JSON = "invalid.options.txt"
        private const val MISSING = "non-existing-file"

        private val validConfig =
            OptionsConfiguration<SentryAndroidOptions> { options ->
                options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
            }
        private val invalidConfig =
            OptionsConfiguration<SentryAndroidOptions> { options ->
                options.dsn = "invalid-dsn"
            }
        private val emptyConfig = OptionsConfiguration<SentryAndroidOptions> {}
    }

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().context
    }

    @After
    fun tearDown() {
        Sentry.close()
    }

    @Test
    fun initialisesSuccessfullyWithDefaultValidJsonFile() { // sentry.options.json
        RNSentrySDK.init(context)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun initialisesSuccessfullyWithValidConfigurationAndDefaultValidJsonFile() {
        RNSentrySDK.init(context, validConfig)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun initialisesSuccessfullyWithValidConfigurationAndInvalidJsonFile() {
        RNSentrySDK.init(context, validConfig, INVALID_OPTIONS, logger)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun initialisesSuccessfullyWithValidConfigurationAndMissingJsonFile() {
        RNSentrySDK.init(context, validConfig, MISSING, logger)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun initialisesSuccessfullyWithValidConfigurationAndErrorInParsingJsonFile() {
        RNSentrySDK.init(context, validConfig, INVALID_JSON, logger)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun initialisesSuccessfullyWithNoConfigurationAndValidJsonFile() {
        RNSentrySDK.init(context, emptyConfig, VALID_OPTIONS, logger)
        assertTrue(Sentry.isEnabled())
    }

    @Test
    fun failsToInitialiseWithNoConfigurationAndInvalidJsonFile() {
        try {
            RNSentrySDK.init(context, emptyConfig, INVALID_OPTIONS, logger)
        } catch (e: Exception) {
            assertEquals(INITIALISATION_ERROR, e.message)
        }
        assertFalse(Sentry.isEnabled())
    }

    @Test
    fun failsToInitialiseWithInvalidConfigAndInvalidJsonFile() {
        try {
            RNSentrySDK.init(context, invalidConfig, INVALID_OPTIONS, logger)
        } catch (e: Exception) {
            assertEquals(INITIALISATION_ERROR, e.message)
        }
        assertFalse(Sentry.isEnabled())
    }

    @Test
    fun failsToInitialiseWithInvalidConfigAndValidJsonFile() {
        try {
            RNSentrySDK.init(context, invalidConfig, VALID_OPTIONS, logger)
        } catch (e: Exception) {
            assertEquals(INITIALISATION_ERROR, e.message)
        }
        assertFalse(Sentry.isEnabled())
    }

    @Test
    fun failsToInitialiseWithInvalidConfigurationAndDefaultValidJsonFile() {
        try {
            RNSentrySDK.init(context, invalidConfig)
        } catch (e: Exception) {
            assertEquals(INITIALISATION_ERROR, e.message)
        }
        assertFalse(Sentry.isEnabled())
    }

    @Test
    fun defaultsAndFinalsAreSetWithValidJsonFile() {
        RNSentrySDK.init(context, emptyConfig, VALID_OPTIONS, logger)
        val actualOptions = Sentry.getCurrentHub().options as SentryAndroidOptions
        verifyDefaults(actualOptions)
        verifyFinals(actualOptions)
        // options file
        assert(actualOptions.dsn == "https://abcd@efgh.ingest.sentry.io/123456")
    }

    @Test
    fun defaultsAndFinalsAreSetWithValidConfiguration() {
        RNSentrySDK.init(context, validConfig, MISSING, logger)
        val actualOptions = Sentry.getCurrentHub().options as SentryAndroidOptions
        verifyDefaults(actualOptions)
        verifyFinals(actualOptions)
        // configuration
        assert(actualOptions.dsn == "https://abcd@efgh.ingest.sentry.io/123456")
    }

    @Test
    fun defaultsOverrideOptionsJsonFile() {
        RNSentrySDK.init(context, emptyConfig, VALID_OPTIONS, logger)
        val actualOptions = Sentry.getCurrentHub().options as SentryAndroidOptions
        assertNull(actualOptions.tracesSampleRate)
        assertEquals(false, actualOptions.enableTracing)
    }

    @Test
    fun configurationOverridesDefaultOptions() {
        val validConfig =
            OptionsConfiguration<SentryAndroidOptions> { options ->
                options.dsn = "https://abcd@efgh.ingest.sentry.io/123456"
                options.tracesSampleRate = 0.5
                options.enableTracing = true
            }
        RNSentrySDK.init(context, validConfig, MISSING, logger)
        val actualOptions = Sentry.getCurrentHub().options as SentryAndroidOptions
        assertEquals(0.5, actualOptions.tracesSampleRate)
        assertEquals(true, actualOptions.enableTracing)
        assert(actualOptions.dsn == "https://abcd@efgh.ingest.sentry.io/123456")
    }

    private fun verifyDefaults(actualOptions: SentryAndroidOptions) {
        assertTrue(actualOptions.ignoredExceptionsForType.contains(JavascriptException::class.java))
        assertEquals(RNSentryVersion.ANDROID_SDK_NAME, actualOptions.sdkVersion?.name)
        assertEquals(
            io.sentry.android.core.BuildConfig.VERSION_NAME,
            actualOptions.sdkVersion?.version,
        )
        val pack = actualOptions.sdkVersion?.packages?.first { it.name == RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_NAME }
        assertNotNull(pack)
        assertEquals(RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_VERSION, pack?.version)
        assertNull(actualOptions.tracesSampleRate)
        assertNull(actualOptions.tracesSampler)
        assertEquals(false, actualOptions.enableTracing)
    }

    private fun verifyFinals(actualOptions: SentryAndroidOptions) {
        val event =
            SentryEvent().apply { sdk = SdkVersion(RNSentryVersion.ANDROID_SDK_NAME, "1.0") }
        val result = actualOptions.beforeSend?.execute(event, Hint())
        assertNotNull(result)
        assertEquals("android", result?.getTag("event.origin"))
        assertEquals("java", result?.getTag("event.environment"))
    }
}
