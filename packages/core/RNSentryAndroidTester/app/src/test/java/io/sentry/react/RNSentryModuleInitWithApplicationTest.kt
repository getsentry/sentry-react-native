package io.sentry.react

import android.app.Application
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.Mockito.mock
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryModuleInitWithApplicationTest {
    @Test
    fun `when application context is null fallback to react context`() {
        val mockedReactContext = Utils.makeReactContextMock()
        whenever(mockedReactContext.applicationContext).thenReturn(null)

        assertSame(RNSentryModuleImpl(mockedReactContext).applicationContext, mockedReactContext)
    }

    @Test
    fun `use application context if available`() {
        val mockedApplicationContext = mock(Application::class.java)
        val mockedReactContext = Utils.makeReactContextMock()
        whenever(mockedReactContext.applicationContext).thenReturn(mockedApplicationContext)

        assertSame(RNSentryModuleImpl(mockedReactContext).applicationContext, mockedApplicationContext)
    }
}
