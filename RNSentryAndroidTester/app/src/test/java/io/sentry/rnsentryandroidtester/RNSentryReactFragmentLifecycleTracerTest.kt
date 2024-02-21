package io.sentry.rnsentryandroidtester

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentManager
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import com.swmansion.rnscreens.ScreenStackFragment
import io.sentry.ILogger
import io.sentry.android.core.BuildInfoProvider
import io.sentry.react.RNSentryModuleImpl
import io.sentry.react.RNSentryReactFragmentLifecycleTracer
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@RunWith(JUnit4::class)
class RNSentryReactFragmentLifecycleTracerTest {

    @Test
    fun tracerAddsListenerForValidRNScreenFragment() {
        val mockEventDispatcher = mockEventDispatched()
        val sut = createSutWith()
        callOnFragmentViewCreated(sut, mockRnScreensFragment(), mockValidView())

        verify(mockEventDispatcher, times(1)).addListener(any())
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
        val logger: ILogger = mock()
        val buildInfo = BuildInfoProvider(logger)

        return RNSentryReactFragmentLifecycleTracer(
            buildInfo,
            mock(),
            logger
        )
    }

    private fun mockRnScreensFragment(): Fragment {
        return mock<ScreenStackFragment>()
    }

    private fun mockValidView(): View {
        val screenMock: View = mock() {
            whenever(it.id).thenReturn(123)
            whenever(it.context).thenReturn(mock<ReactContext>())
        }
        val mockView = mock<ViewGroup> {
            whenever(it.childCount).thenReturn(1)
            whenever(it.getChildAt(0)).thenReturn(screenMock)
        }
        return mockView;
    }

    private fun mockEventDispatched(): EventDispatcher {
        val mockEventDispatcher = mock<EventDispatcher>()
        val mockUIManager = mockStatic(UIManagerHelper::class.java)
        mockUIManager
            .`when`<ReactContext> { UIManagerHelper.getReactContext(any()) }
            .thenReturn(mock())
        mockUIManager
            .`when`<EventDispatcher> { UIManagerHelper.getEventDispatcherForReactTag(any(), anyInt()) }
            .thenReturn(mockEventDispatcher)
        return mockEventDispatcher
    }
}
