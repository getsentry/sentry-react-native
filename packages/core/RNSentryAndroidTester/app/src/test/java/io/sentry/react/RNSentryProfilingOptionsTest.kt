package io.sentry.react

import com.facebook.react.bridge.JavaOnlyMap
import io.sentry.ILogger
import io.sentry.ProfileLifecycle
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroidOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentMatchers.anyString
import org.mockito.ArgumentMatchers.eq
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.verify

/**
 * Pins the wiring of `_experiments.profilingOptions` from the JS bridge into
 * `SentryAndroidOptions` via `RNSentryStart.configureAndroidProfiling`.
 *
 * The Android side is correctly wired today (unlike the iOS bug fixed in #6012). These tests
 * ensure that a future refactor moving `configureAndroidProfiling` out of the live init path
 * — the same shape of regression as the iOS one — fails loudly.
 */
@RunWith(JUnit4::class)
class RNSentryProfilingOptionsTest {
    private lateinit var logger: ILogger

    @Before
    fun setUp() {
        logger = mock(ILogger::class.java)
    }

    @Test
    fun `profilingOptions wires sessionSampleRate, startOnAppStart, and a MANUAL native lifecycle`() {
        val rnOptions =
            JavaOnlyMap.of(
                "_experiments",
                JavaOnlyMap.of(
                    "profilingOptions",
                    JavaOnlyMap.of(
                        "profileSessionSampleRate",
                        1.0,
                        "lifecycle",
                        "trace",
                        "startOnAppStart",
                        true,
                    ),
                ),
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertEquals(1.0, options.profileSessionSampleRate!!, 0.0)
        assertEquals(ProfileLifecycle.MANUAL, options.profileLifecycle)
        assertTrue(options.isStartProfilerOnAppStart)
    }

    @Test
    fun `profilingOptions startOnAppStart false is honored`() {
        val rnOptions =
            JavaOnlyMap.of(
                "_experiments",
                JavaOnlyMap.of(
                    "profilingOptions",
                    JavaOnlyMap.of("startOnAppStart", false),
                ),
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse(options.isStartProfilerOnAppStart)
    }

    @Test
    fun `no _experiments key leaves profiling defaults untouched`() {
        val rnOptions = JavaOnlyMap()
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertNull(options.profileSessionSampleRate)
        assertEquals(ProfileLifecycle.MANUAL, options.profileLifecycle)
        assertFalse(options.isStartProfilerOnAppStart)
    }

    @Test
    fun `_experiments without profilingOptions leaves profiling defaults untouched`() {
        val rnOptions = JavaOnlyMap.of("_experiments", JavaOnlyMap())
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertNull(options.profileSessionSampleRate)
        assertEquals(ProfileLifecycle.MANUAL, options.profileLifecycle)
        assertFalse(options.isStartProfilerOnAppStart)
    }

    @Test
    fun `empty profilingOptions leaves profiling defaults untouched`() {
        val rnOptions =
            JavaOnlyMap.of(
                "_experiments",
                JavaOnlyMap.of("profilingOptions", JavaOnlyMap()),
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertNull(options.profileSessionSampleRate)
        assertEquals(ProfileLifecycle.MANUAL, options.profileLifecycle)
        assertFalse(options.isStartProfilerOnAppStart)
    }

    @Test
    fun `non-number profileSessionSampleRate logs a warning and is ignored`() {
        val rnOptions =
            JavaOnlyMap.of(
                "_experiments",
                JavaOnlyMap.of(
                    "profilingOptions",
                    JavaOnlyMap.of("profileSessionSampleRate", "not-a-number"),
                ),
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertNull(options.profileSessionSampleRate)
        verify(logger, times(1)).log(eq(SentryLevel.WARNING), anyString())
    }

    @Test
    fun `non-boolean startOnAppStart logs a warning and is ignored`() {
        val rnOptions =
            JavaOnlyMap.of(
                "_experiments",
                JavaOnlyMap.of(
                    "profilingOptions",
                    JavaOnlyMap.of("startOnAppStart", "yes"),
                ),
            )
        val options = SentryAndroidOptions()

        RNSentryStart.getSentryAndroidOptions(options, rnOptions, logger)

        assertFalse(options.isStartProfilerOnAppStart)
        verify(logger, times(1)).log(eq(SentryLevel.WARNING), anyString())
    }
}
