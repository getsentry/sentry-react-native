package io.sentry.react

import android.os.Looper
import com.facebook.react.bridge.Promise
import io.sentry.ILogger
import io.sentry.SentryDate
import io.sentry.SentryDateProvider
import io.sentry.SentryLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class RNSentryTimeToDisplayTest {
    companion object {
        val TEST_ID = "test-id"
        val TEST_VAL = 123.4
    }

    @Before
    fun setUp() {
    }

    @Test
    fun `puts and pops record`() {
        RNSentryTimeToDisplay.putTimeToDisplayFor(TEST_ID, TEST_VAL)

        val firstPop = RNSentryTimeToDisplay.popTimeToDisplayFor(TEST_ID)
        val secondPop = RNSentryTimeToDisplay.popTimeToDisplayFor(TEST_ID)

        assertEquals(firstPop, TEST_VAL, 0.0)
        assertNull(secondPop)
    }

    @Test
    fun `removes oldes entry when full`() {
        val maxSize = RNSentryTimeToDisplay.ENTRIES_MAX_SIZE + 1
        for (i in 1..maxSize) {
            RNSentryTimeToDisplay.putTimeToDisplayFor("$TEST_ID-$i", i.toDouble())
        }

        val oldestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-1")
        val secondOldestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-2")
        val newestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-$maxSize")

        assertNull(oldestEntry)
        assertNotNull(secondOldestEntry)
        assertNotNull(newestEntry)
    }

    @Test
    fun `resolveSafely settles the promise only once`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)

        RNSentryTimeToDisplay.resolveSafely(promise, settled, 1.0, logger)
        RNSentryTimeToDisplay.resolveSafely(promise, settled, 2.0, logger)

        verify(promise, times(1)).resolve(1.0)
        verify(promise, never()).resolve(2.0)
    }

    @Test
    fun `resolveSafely does not throw when the bridge callback was already settled`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)
        // Simulate the runtime having already settled/invalidated the bridge callback, as happens
        // on Expo bridgeless under rapid navigation ("JavaCallback was already settled"). (#6709)
        doThrow(RuntimeException("JavaCallback was already settled. Cannot invoke it again"))
            .whenever(promise)
            .resolve(any())

        // Must not propagate - a throw here reaches the host app as a fatal uncaught exception.
        RNSentryTimeToDisplay.resolveSafely(promise, settled, 1.0, logger)

        verify(logger).log(eq(SentryLevel.WARNING), any<String>(), any<Throwable>())
    }

    @Test
    fun `rejectSafely is a no-op once the promise has been resolved`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)

        RNSentryTimeToDisplay.resolveSafely(promise, settled, 1.0, logger)
        RNSentryTimeToDisplay.rejectSafely(promise, settled, "boom", null, logger)

        verify(promise, times(1)).resolve(1.0)
        verify(promise, never()).reject(any<String>(), any<String>())
    }

    @Test
    fun `rejectSafely does not throw when the bridge callback was already settled`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)
        doThrow(RuntimeException("JavaCallback was already settled. Cannot invoke it again"))
            .whenever(promise)
            .reject(any<String>(), any<String>())

        RNSentryTimeToDisplay.rejectSafely(promise, settled, "boom", null, logger)

        verify(logger).log(eq(SentryLevel.WARNING), any<String>(), any<Throwable>())
    }

    @Test
    fun `rejectSafely with a cause passes an explicit error code to the coded overload`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)
        val cause = RuntimeException("boom")

        RNSentryTimeToDisplay.rejectSafely(promise, settled, "message", cause, logger)

        // The code must be the stable "SentryReactNative" identifier, not the descriptive message -
        // reject(String, Throwable) would otherwise use the message as the error code.
        verify(promise, times(1)).reject(eq("SentryReactNative"), eq("message"), eq(cause))
    }

    @Test
    fun `resolveSafely swallows failures that are not the already-settled case`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val settled = AtomicBoolean(false)
        // The guard must degrade on any settle failure, not only the literal "already settled"
        // message - e.g. a torn-down Catalyst instance - so it can never crash the host app.
        doThrow(IllegalStateException("Tried to access a JS module after the React instance was destroyed"))
            .whenever(promise)
            .resolve(any())

        RNSentryTimeToDisplay.resolveSafely(promise, settled, 1.0, logger)

        verify(logger).log(eq(SentryLevel.WARNING), any<String>(), any<Throwable>())
    }

    // End-to-end tests that drive the real getTimeToDisplay path (main-thread Handler post +
    // Choreographer frame callback), so the crashing production code - not just the helpers - is
    // covered.

    private fun mockDateProvider(nanoTimestamp: Long): SentryDateProvider {
        val date = mock<SentryDate>()
        whenever(date.nanoTimestamp()).thenReturn(nanoTimestamp)
        val dateProvider = mock<SentryDateProvider>()
        whenever(dateProvider.now()).thenReturn(date)
        return dateProvider
    }

    @Test
    fun `getTimeToDisplay resolves once with the frame timestamp in seconds`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val dateProvider = mockDateProvider(2_000_000_000L) // 2s expressed in nanoseconds

        RNSentryTimeToDisplay.getTimeToDisplay(promise, dateProvider, logger)

        // Run the posted main-thread runnable and the Choreographer frame callback.
        shadowOf(Looper.getMainLooper()).idle()

        verify(promise, times(1)).resolve(2.0)
        verify(promise, never()).reject(any<String>(), any<String>())
    }

    @Test
    fun `getTimeToDisplay does not crash the host app when the promise was already settled`() {
        val promise = mock<Promise>()
        val logger = mock<ILogger>()
        val dateProvider = mockDateProvider(2_000_000_000L)
        // Reproduce the reported crash: the bridge callback backing the promise has already been
        // settled by the runtime, so resolving it from the frame callback throws. (#6709)
        doThrow(RuntimeException("JavaCallback was already settled. Cannot invoke it again"))
            .whenever(promise)
            .resolve(any())

        RNSentryTimeToDisplay.getTimeToDisplay(promise, dateProvider, logger)

        // Before the fix this propagated out of the frame callback as a fatal uncaught exception.
        shadowOf(Looper.getMainLooper()).idle()

        verify(logger).log(eq(SentryLevel.WARNING), any<String>(), any<Throwable>())
    }
}
