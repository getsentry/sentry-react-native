package io.sentry.react.utils

import android.app.Activity
import com.facebook.react.bridge.ReactApplicationContext
import io.sentry.android.core.AndroidLogger
import io.sentry.android.core.CurrentActivityHolder
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.Mockito.mock
import org.mockito.kotlin.whenever

@RunWith(JUnit4::class)
class RNSentryActivityUtilsTest {
    private val mockedLogger = mock(AndroidLogger::class.java)

    @After
    fun clearActivityHolder() {
        CurrentActivityHolder.getInstance().clearActivity()
    }

    @Test
    fun `returns react context activity`() {
        val mockedCurrentActivity = mock(Activity::class.java)
        val mockedReactContext = mock(ReactApplicationContext::class.java)
        whenever(mockedReactContext.currentActivity).thenReturn(mockedCurrentActivity)

        assertSame(RNSentryActivityUtils.getCurrentActivity(mockedReactContext, mockedLogger), mockedCurrentActivity)
    }

    @Test
    fun `returns current activity holder activity`() {
        val mockedCurrentActivity = mock(Activity::class.java)

        val mockedReactContext = mock(ReactApplicationContext::class.java)
        whenever(mockedReactContext.currentActivity).thenReturn(null)

        CurrentActivityHolder.getInstance().setActivity(mockedCurrentActivity)
        assertSame(RNSentryActivityUtils.getCurrentActivity(mockedReactContext, mockedLogger), mockedCurrentActivity)
    }

    @Test
    fun `returns null when no activity exists`() {
        val mockedReactContext = mock(ReactApplicationContext::class.java)
        whenever(mockedReactContext.currentActivity).thenReturn(null)

        assertNull(RNSentryActivityUtils.getCurrentActivity(mockedReactContext, mockedLogger))
    }
}
