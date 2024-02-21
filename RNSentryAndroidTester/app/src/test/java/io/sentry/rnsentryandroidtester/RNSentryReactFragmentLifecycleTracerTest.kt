package io.sentry.rnsentryandroidtester

import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import com.swmansion.rnscreens.ScreenStackFragment
import io.sentry.ILogger
import io.sentry.android.core.BuildInfoProvider
import io.sentry.react.RNSentryReactFragmentLifecycleTracer
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
class RNSentryReactFragmentLifecycleTracerTest {

    private var mockUIManager: MockedStatic<UIManagerHelper>? = null

    @After
    fun after() {
        mockUIManager?.close();
    }

    @Test
    fun tracerAddsListenerForValidRNScreenFragment() {
        val mockEventDispatcher = mock<EventDispatcher>();
        mockUIManager(mockEventDispatcher);

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithReactContext())
        verify(mockEventDispatcher, times(1)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForGenericFragment() {
        val mockEventDispatcher = mock<EventDispatcher>();
        mockUIManager(mockEventDispatcher);

        callOnFragmentViewCreated(mock<Fragment>(), mockScreenViewWithReactContext())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutChild() {
        val mockEventDispatcher = mock<EventDispatcher>();
        mockUIManager(mockEventDispatcher);

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithoutChild())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutReactContext() {
        val mockEventDispatcher = mock<EventDispatcher>();
        mockUIManager(mockEventDispatcher);

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithGenericContext())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithNoId() {
        val mockEventDispatcher = mock<EventDispatcher>();
        mockUIManager(mockEventDispatcher);

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithNoId())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutEventDispatcher() {
        mockUIManagerToReturnNullEventDispatcher();

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithGenericContext())
    }

    private fun callOnFragmentViewCreated(mockFragment: Fragment, mockView: View) {
        createSutWith().onFragmentViewCreated(
            mock(),
            mockFragment,
            mockView,
            null,
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

    private fun mockScreenViewWithReactContext(): View {
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

    private fun mockScreenViewWithGenericContext(): View {
        val screenMock: View = mock() {
            whenever(it.id).thenReturn(123)
            whenever(it.context).thenReturn(mock())
        }
        val mockView = mock<ViewGroup> {
            whenever(it.childCount).thenReturn(1)
            whenever(it.getChildAt(0)).thenReturn(screenMock)
        }
        return mockView;
    }

    private fun mockScreenViewWithNoId(): View {
        val screenMock: View = mock() {
            whenever(it.id).thenReturn(-1)
            whenever(it.context).thenReturn(mock<ReactContext>())
        }
        val mockView = mock<ViewGroup> {
            whenever(it.childCount).thenReturn(1)
            whenever(it.getChildAt(0)).thenReturn(screenMock)
        }
        return mockView;
    }

    private fun mockScreenViewWithoutChild(): View {
        return mock<ViewGroup> {
            whenever(it.childCount).thenReturn(0)
        }
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

    private fun mockUIManagerToReturnNullEventDispatcher() {
        mockUIManager = mockStatic(UIManagerHelper::class.java)
        mockUIManager
            ?.`when`<ReactContext> { UIManagerHelper.getReactContext(any()) }
            ?.thenReturn(mock())
        mockUIManager
            ?.`when`<EventDispatcher> { UIManagerHelper.getEventDispatcherForReactTag(any(), anyInt()) }
            ?.thenReturn(null)
    }
}
