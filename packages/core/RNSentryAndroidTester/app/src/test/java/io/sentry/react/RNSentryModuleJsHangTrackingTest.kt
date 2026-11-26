package io.sentry.react

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryModuleJsHangTrackingTest {
    private val module = Utils.createRNSentryModuleWithMockedContext()

    private val tracker: RNSentryJSHangTracker
        get() =
            RNSentryModuleImpl::class.java
                .getDeclaredField("jsHangTracker")
                .apply { isAccessible = true }
                .get(module) as RNSentryJSHangTracker

    @After
    fun tearDown() {
        module.stopJsHangTracking()
    }

    @Test
    fun `starts JS hang tracking with a valid timeout`() {
        module.startJsHangTracking(2000.0, "debug-id")

        assertTrue(tracker.isRunning)
    }

    @Test
    fun `does not start JS hang tracking with an invalid timeout`() {
        for (timeout in listOf(Double.NaN, Double.POSITIVE_INFINITY, 0.5, -1.0)) {
            module.startJsHangTracking(timeout, null)

            assertFalse("timeout $timeout", tracker.isRunning)
        }
    }

    @Test
    fun `stopJsHangTracking stops the tracker`() {
        module.startJsHangTracking(2000.0, null)

        module.stopJsHangTracking()

        assertFalse(tracker.isRunning)
    }

    @Test
    fun `invalidate stops the tracker before the JS thread is destroyed`() {
        module.startJsHangTracking(2000.0, null)

        module.invalidate()

        assertFalse(tracker.isRunning)
    }
}
