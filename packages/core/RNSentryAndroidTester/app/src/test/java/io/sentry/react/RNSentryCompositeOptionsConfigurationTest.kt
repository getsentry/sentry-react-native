package io.sentry.react

import io.sentry.Sentry.OptionsConfiguration
import io.sentry.android.core.SentryAndroidOptions
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify

@RunWith(JUnit4::class)
class RNSentryCompositeOptionsConfigurationTest {
    @Test
    fun `configure should call base and overriding configurations`() {
        val baseConfig: OptionsConfiguration<SentryAndroidOptions> = mock()
        val overridingConfig: OptionsConfiguration<SentryAndroidOptions> = mock()

        val compositeConfig = RNSentryCompositeOptionsConfiguration(baseConfig, overridingConfig)
        val options = SentryAndroidOptions()
        compositeConfig.configure(options)

        verify(baseConfig).configure(options)
        verify(overridingConfig).configure(options)
    }

    @Test
    fun `configure should apply base configuration and override values`() {
        val baseConfig =
            OptionsConfiguration<SentryAndroidOptions> { options ->
                options.dsn = "https://base-dsn@sentry.io"
                options.isDebug = false
                options.release = "some-release"
            }
        val overridingConfig =
            OptionsConfiguration<SentryAndroidOptions> { options ->
                options.dsn = "https://over-dsn@sentry.io"
                options.isDebug = true
                options.environment = "production"
            }

        val compositeConfig = RNSentryCompositeOptionsConfiguration(baseConfig, overridingConfig)
        val options = SentryAndroidOptions()
        compositeConfig.configure(options)

        assert(options.dsn == "https://over-dsn@sentry.io") // overridden value
        assert(options.isDebug) // overridden value
        assert(options.release == "some-release") // base value not overridden
        assert(options.environment == "production") // overridden value not in base
    }
}
