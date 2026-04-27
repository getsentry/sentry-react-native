package io.sentry.react

import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Tests for the profiling lifecycle on the RNSentryModuleImpl.
 *
 * Note: the Hermes sampling profiler is a JNI-backed static API and cannot be loaded in a pure
 * JVM unit-test environment. These tests exercise only the paths that do not cross the JNI
 * boundary — specifically, the invalidate() guard that returns early when profiling is not
 * active. If the guard were to regress and call into Hermes, the tests would fail with
 * UnsatisfiedLinkError.
 */
@RunWith(RobolectricTestRunner::class)
class RNSentryProfilingTest {
    @Test
    fun `invalidate is a no-op on a fresh module`() {
        val module = Utils.createRNSentryModuleWithMockedContext()
        // isProfiling starts false; invalidate() should return early without touching
        // HermesSamplingProfiler. If it didn't, the JNI call would throw UnsatisfiedLinkError.
        module.invalidate()
    }

    @Test
    fun `invalidate is idempotent`() {
        val module = Utils.createRNSentryModuleWithMockedContext()
        module.invalidate()
        module.invalidate()
        module.invalidate()
    }
}
