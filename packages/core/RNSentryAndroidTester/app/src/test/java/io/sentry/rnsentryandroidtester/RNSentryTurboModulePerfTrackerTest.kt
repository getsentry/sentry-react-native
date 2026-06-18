package io.sentry.rnsentryandroidtester

import io.sentry.react.RNSentryTurboModulePerfTracker
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Unit coverage for the JVM-side wrapper around the native perf-logger toggle.
 *
 * In a host JVM (where this test runs) there is no Android system loader for
 * `libsentry-tm-perf-logger.so`, so any call into the native method must throw
 * `UnsatisfiedLinkError`. The tracker is expected to swallow that error and
 * flip an internal latch so subsequent calls short-circuit without retrying.
 */
// Robolectric runner so the `android.util.Log` call inside the tracker's
// `catch` branch resolves to a real implementation instead of the
// default-not-mocked stub the bare JUnit4 runner exposes.
@RunWith(RobolectricTestRunner::class)
class RNSentryTurboModulePerfTrackerTest {
    @Before
    fun resetLatch() {
        // Each test exercises the latch transition from scratch; without this
        // reset the second test in execution order would see the latch already
        // tripped from the previous one.
        RNSentryTurboModulePerfTracker.resetNativeUnavailableForTests()
    }

    @After
    fun cleanUp() {
        RNSentryTurboModulePerfTracker.resetNativeUnavailableForTests()
    }

    @Test
    fun setEnabledSwallowsUnsatisfiedLinkErrorOnFirstCall() {
        // No `.so` loaded in the test JVM → the JNI symbol is missing. The
        // tracker must absorb the resulting `UnsatisfiedLinkError` so the
        // caller does not see a crash on a misconfigured host.
        RNSentryTurboModulePerfTracker.setEnabled(true)
        // Reaching this point means the error was caught, which is the contract.
        assertTrue(
            "after a failed link, the tracker must latch the failure",
            RNSentryTurboModulePerfTracker.isNativeUnavailableForTests(),
        )
    }

    @Test
    fun subsequentCallsShortCircuitAfterLatchTrips() {
        // Trip the latch via the first call.
        RNSentryTurboModulePerfTracker.setEnabled(true)
        assertTrue(RNSentryTurboModulePerfTracker.isNativeUnavailableForTests())

        // The second call must not throw or attempt to relink. The contract is
        // "exactly one UnsatisfiedLinkError per process lifetime" — anything
        // else means the tracker is hammering the runtime on every setEnabled.
        RNSentryTurboModulePerfTracker.setEnabled(false)
        RNSentryTurboModulePerfTracker.setEnabled(true)
        assertTrue(
            "latch must stay tripped across repeated calls",
            RNSentryTurboModulePerfTracker.isNativeUnavailableForTests(),
        )
    }

    @Test
    fun resetClearsTheLatch() {
        RNSentryTurboModulePerfTracker.setEnabled(true)
        assertTrue(RNSentryTurboModulePerfTracker.isNativeUnavailableForTests())

        RNSentryTurboModulePerfTracker.resetNativeUnavailableForTests()
        assertFalse(
            "the @TestOnly reset must clear the latch so tests can re-exercise it",
            RNSentryTurboModulePerfTracker.isNativeUnavailableForTests(),
        )
    }
}
