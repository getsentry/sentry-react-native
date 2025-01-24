package io.sentry.react

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.sentry.ILogger
import io.sentry.Sentry
import io.sentry.Sentry.OptionsConfiguration
import io.sentry.android.core.AndroidLogger
import io.sentry.android.core.SentryAndroidOptions
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
        try{
        RNSentrySDK.init(context, invalidConfig)
        } catch (e: Exception) {
            assertEquals(INITIALISATION_ERROR, e.message)
        }
        assertFalse(Sentry.isEnabled())
    }
}
