package io.sentry.rnsentryandroidtester

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import io.sentry.ILogger
import io.sentry.android.core.AndroidLogger
import io.sentry.android.core.BuildInfoProvider
import io.sentry.react.RNSentryModuleImpl
import io.sentry.react.RNSentryReactFragmentLifecycleTracer
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@RunWith(AndroidJUnit4::class)
class RNSentryReactFragmentLifecycleTracerTest {

    @Test
    fun tracerAddsListenerForValidRNScreenFragment() {
        val mockEventDispatcher = mockEventDispatched()
        val sut = createSutWith()
        callOnFragmentViewCreated(sut, mockRnScreensFragment(), mockValidView())

        verify(mockEventDispatcher, times(1)).addListener(Mockito.any())
    }

    private fun callOnFragmentViewCreated(sut: RNSentryReactFragmentLifecycleTracer, mockFragment: Fragment, mockView: View) {
        val mockFragmentManager: FragmentManager = mock()
        val nullBundle: Bundle? = null;

        sut.onFragmentViewCreated(
            mockFragmentManager,
            mockFragment,
            mockView,
            nullBundle,
        )
    }

    private fun createSutWith(): RNSentryReactFragmentLifecycleTracer {
        val logger: ILogger = AndroidLogger(RNSentryModuleImpl.NAME)
        val buildInfo = BuildInfoProvider(logger)

        return RNSentryReactFragmentLifecycleTracer(
            buildInfo,
            mock(),
            logger
        )
    }

    private fun mockRnScreensFragment(): Fragment {
        val mockFragment: Fragment = mock()
        val mockFragmentClass: Class<Fragment> = mock()
        whenever(mockFragmentClass.canonicalName).thenReturn("com.swmansion.rnscreens.ScreenStackFragment")
        whenever(mockFragment.javaClass).thenReturn(mockFragmentClass)

        return mockFragment
    }

    private fun mockValidView(): View {
        val mockView = mock<ViewGroup>();

        return mockView;
    }

    private fun mockEventDispatched(): EventDispatcher {
        val mockEventDispatcher = mock<EventDispatcher>()
        val mockUIManager = mockStatic(UIManagerHelper::class.java)
        mockUIManager
            .`when`<ReactContext> { UIManagerHelper.getReactContext(Mockito.any()) }
            .thenReturn(mock())
        mockUIManager
            .`when`<EventDispatcher> { UIManagerHelper.getEventDispatcherForReactTag(Mockito.any(), Mockito.any()) }
            .thenReturn(mockEventDispatcher)
        return mockEventDispatcher
    }
}