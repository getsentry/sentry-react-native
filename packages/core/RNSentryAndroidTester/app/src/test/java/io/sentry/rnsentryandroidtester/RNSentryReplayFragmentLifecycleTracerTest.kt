package io.sentry.rnsentryandroidtester

import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.fragment.app.Fragment
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import com.swmansion.rnscreens.ScreenStackFragment
import io.sentry.ILogger
import io.sentry.react.RNSentryReplayFragmentLifecycleTracer
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.MockedStatic
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@RunWith(JUnit4::class)
class RNSentryReplayFragmentLifecycleTracerTest {
    private var mockUIManager: MockedStatic<UIManagerHelper>? = null

    @After
    fun after() {
        mockUIManager?.close()
    }

    @Test
    fun tracerAttachesLayoutListener() {
        val mockEventDispatcher = mock<EventDispatcher>()
        val mockViewTreeObserver = mock<ViewTreeObserver>()
        mockUIManager(mockEventDispatcher)

        val mockView = mockScreenViewWithReactContext(mockViewTreeObserver)
        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockView)

        verify(mockViewTreeObserver, times(1)).addOnGlobalLayoutListener(any())
    }

    @Test
    fun tracerRemovesLayoutListenerWhenFragmentViewDestroyed() {
        val mockEventDispatcher = mock<EventDispatcher>()
        val mockViewTreeObserver = mock<ViewTreeObserver>()
        mockUIManager(mockEventDispatcher)

        val mockFragment = mock<ScreenStackFragment>()
        val mockView = mockScreenViewWithReactContext(mockViewTreeObserver)

        val tracer = createSutWith()
        tracer.onFragmentViewCreated(mock(), mockFragment, mockView, null)
        tracer.onFragmentViewDestroyed(mock(), mockFragment)

        verify(mockViewTreeObserver, times(1)).removeOnGlobalLayoutListener(any())
    }

    private fun callOnFragmentViewCreated(
        mockFragment: Fragment,
        mockView: View,
    ) {
        createSutWith().onFragmentViewCreated(
            mock(),
            mockFragment,
            mockView,
            null,
        )
    }

    private fun createSutWith(): RNSentryReplayFragmentLifecycleTracer {
        val logger: ILogger = mock()

        return RNSentryReplayFragmentLifecycleTracer(logger)
    }

    private fun mockScreenViewWithReactContext(mockViewTreeObserver: ViewTreeObserver = mock()): View {
        val screenMock: View =
            mock {
                whenever(it.id).thenReturn(123)
                whenever(it.context).thenReturn(mock<ReactContext>())
                whenever(it.viewTreeObserver).thenReturn(mockViewTreeObserver)
            }
        val mockView =
            mock<ViewGroup> {
                whenever(it.childCount).thenReturn(1)
                whenever(it.getChildAt(0)).thenReturn(screenMock)
                whenever(it.viewTreeObserver).thenReturn(mockViewTreeObserver)
            }
        return mockView
    }

    private fun mockUIManager(mockEventDispatcher: EventDispatcher) {
        mockUIManager = mockStatic(UIManagerHelper::class.java)
        mockUIManager
            ?.`when`<ReactContext> { UIManagerHelper.getReactContext(any()) }
            ?.thenReturn(mock())
        mockUIManager
            ?.`when`<EventDispatcher> { UIManagerHelper.getEventDispatcherForReactTag(any(), anyInt()) }
            ?.thenReturn(mockEventDispatcher)
    }
}
