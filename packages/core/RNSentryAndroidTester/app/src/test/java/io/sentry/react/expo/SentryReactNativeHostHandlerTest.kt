package io.sentry.react.expo

import io.sentry.Sentry
import io.sentry.exception.ExceptionMechanismException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.MockedStatic
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mockStatic
import org.mockito.Mockito.spy
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

@RunWith(JUnit4::class)
class SentryReactNativeHostHandlerTest {
    private var sentryMock: MockedStatic<Sentry>? = null

    @After
    fun tearDown() {
        sentryMock?.close()
    }

    /** Creates a handler that pretends `expo-updates` is on the classpath, so the rethrow is suppressed. */
    private fun handlerWithExpoUpdates(): SentryReactNativeHostHandler {
        val handler = spy(SentryReactNativeHostHandler())
        doReturn(true).`when`(handler).isExpoUpdatesPresent()
        return handler
    }

    /** Creates a handler that pretends `expo-updates` is absent, so the original exception is rethrown. */
    private fun handlerWithoutExpoUpdates(): SentryReactNativeHostHandler {
        val handler = spy(SentryReactNativeHostHandler())
        doReturn(false).`when`(handler).isExpoUpdatesPresent()
        return handler
    }

    @Test
    fun `does not capture when in developer support mode`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
            }

        val handler = handlerWithoutExpoUpdates()
        // In dev mode we bail early — no capture and no rethrow.
        handler.onReactInstanceException(true, RuntimeException("test"))

        sentryMock!!.verify({ Sentry.captureException(any()) }, never())
    }

    @Test
    fun `does not capture when sentry is not enabled but still rethrows`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(false)
            }

        val handler = handlerWithoutExpoUpdates()
        val originalException = RuntimeException("test")

        val thrown =
            assertThrows(RuntimeException::class.java) {
                handler.onReactInstanceException(false, originalException)
            }
        assertSame(originalException, thrown)

        sentryMock!!.verify({ Sentry.captureException(any()) }, never())
    }

    @Test
    fun `captures exception with unhandled mechanism when sentry is enabled and rethrows`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
            }

        val handler = handlerWithoutExpoUpdates()
        val originalException = IllegalStateException("Fabric crash")

        val thrown =
            assertThrows(IllegalStateException::class.java) {
                handler.onReactInstanceException(false, originalException)
            }
        assertSame(originalException, thrown)

        val captor = argumentCaptor<Throwable>()
        sentryMock!!.verify { Sentry.captureException(captor.capture()) }

        val captured = captor.firstValue
        assertTrue(
            "Expected ExceptionMechanismException but got ${captured::class.java}",
            captured is ExceptionMechanismException,
        )

        val mechanismException = captured as ExceptionMechanismException
        val mechanism = mechanismException.exceptionMechanism
        assertEquals("expoReactHost", mechanism.type)
        assertFalse("Mechanism should be unhandled", mechanism.isHandled!!)
        assertEquals(originalException, mechanismException.throwable)
        assertNotNull(mechanismException.thread)
    }

    @Test
    fun `rethrows original exception even when sentry capture fails`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
                it
                    .`when`<Any> { Sentry.captureException(any()) }
                    .thenThrow(RuntimeException("Sentry internal error"))
            }

        val handler = handlerWithoutExpoUpdates()
        val originalException = IllegalStateException("test")

        // Sentry's internal failure must be swallowed, but the original native exception is still
        // rethrown so Android's UncaughtExceptionHandler can terminate the process.
        val thrown =
            assertThrows(IllegalStateException::class.java) {
                handler.onReactInstanceException(false, originalException)
            }
        assertSame(originalException, thrown)
    }

    @Test
    fun `does not rethrow when expo-updates is present`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
            }

        val handler = handlerWithExpoUpdates()
        // Must not throw — expo-updates' error-recovery flow gets a chance to run.
        handler.onReactInstanceException(false, IllegalStateException("test"))

        sentryMock!!.verify { Sentry.captureException(any()) }
    }
}
