package io.sentry.react.expo

import io.sentry.Sentry
import io.sentry.exception.ExceptionMechanismException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.MockedStatic
import org.mockito.Mockito.mockStatic
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

    @Test
    fun `does not capture when in developer support mode`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
            }

        val handler = SentryReactNativeHostHandler()
        handler.onReactInstanceException(true, RuntimeException("test"))

        sentryMock!!.verify({ Sentry.captureException(any()) }, never())
    }

    @Test
    fun `does not capture when sentry is not enabled`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(false)
            }

        val handler = SentryReactNativeHostHandler()
        handler.onReactInstanceException(false, RuntimeException("test"))

        sentryMock!!.verify({ Sentry.captureException(any()) }, never())
    }

    @Test
    fun `captures exception with unhandled mechanism when sentry is enabled`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
            }

        val handler = SentryReactNativeHostHandler()
        val originalException = IllegalStateException("Fabric crash")

        handler.onReactInstanceException(false, originalException)

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
    fun `does not throw when sentry capture fails`() {
        sentryMock =
            mockStatic(Sentry::class.java).also {
                it.`when`<Boolean> { Sentry.isEnabled() }.thenReturn(true)
                it.`when`<Any> { Sentry.captureException(any()) }.thenThrow(RuntimeException("Sentry internal error"))
            }

        val handler = SentryReactNativeHostHandler()
        // Should not throw
        handler.onReactInstanceException(false, IllegalStateException("test"))
    }
}
