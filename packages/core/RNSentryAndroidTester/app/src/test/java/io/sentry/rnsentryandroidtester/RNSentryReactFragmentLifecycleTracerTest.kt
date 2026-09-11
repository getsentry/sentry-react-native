package io.sentry.rnsentryandroidtester

import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.uimanager.events.EventDispatcher
import com.facebook.react.uimanager.events.EventDispatcherListener
import com.swmansion.rnscreens.ScreenStackFragment
import com.swmansion.rnscreens.events.ScreenAppearEvent
import io.sentry.ILogger
import io.sentry.android.core.BuildInfoProvider
import io.sentry.android.core.internal.util.FirstDrawDoneListener
import io.sentry.react.RNSentryReactFragmentLifecycleTracer
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.MockedStatic
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@RunWith(JUnit4::class)
class RNSentryReactFragmentLifecycleTracerTest {
    private var mockUIManager: MockedStatic<UIManagerHelper>? = null

    @After
    fun after() {
        mockUIManager?.close()
    }

    @Test
    fun tracerAddsListenerForValidRNScreenFragment() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithReactContext())
        verify(mockEventDispatcher, times(1)).addListener(any())
    }

    @Test
    fun tracerListensForFirstDrawOnScreenAppearEvent() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        mockStatic(FirstDrawDoneListener::class.java).use { firstDrawDoneListener ->
            callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithReactContext())

            dispatchEventNamed("topAppear", mockEventDispatcher)

            firstDrawDoneListener.verify {
                FirstDrawDoneListener.registerForNextDraw(
                    any(View::class.java),
                    any(Runnable::class.java),
                    any(BuildInfoProvider::class.java),
                )
            }
            verify(mockEventDispatcher, times(1)).removeListener(any())
        }
    }

    @Test
    fun tracerDoesNotListenForFirstDrawOnOtherEvents() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        mockStatic(FirstDrawDoneListener::class.java).use { firstDrawDoneListener ->
            callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithReactContext())

            dispatchEvent(ScreenAppearEvent("topWillAppear"), mockEventDispatcher)

            firstDrawDoneListener.verify({
                FirstDrawDoneListener.registerForNextDraw(
                    any(View::class.java),
                    any(Runnable::class.java),
                    any(BuildInfoProvider::class.java),
                )
            }, never())
            verify(mockEventDispatcher, never()).removeListener(any())
        }
    }

    @Test
    fun tracerRemovesListenerWhenFragmentViewDestroyed() {
        val mockEventDispatcher = mock<EventDispatcher>()
        val fragment = mock<ScreenStackFragment>()

        val tracer = createSutWith()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(fragment, mockScreenViewWithReactContext(), tracer)
        verify(mockEventDispatcher, times(1)).addListener(any())

        callOnFragmentViewDestroyed(fragment, tracer)
        verify(mockEventDispatcher, times(1)).removeListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForGenericFragment() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(mock<Fragment>(), mockScreenViewWithReactContext())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutChild() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithoutChild())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutReactContext() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithGenericContext())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithNoId() {
        val mockEventDispatcher = mock<EventDispatcher>()
        mockUIManager(mockEventDispatcher)

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithNoId())
        verify(mockEventDispatcher, times(0)).addListener(any())
    }

    @Test
    fun tracerDoesNotAddListenerForViewWithoutEventDispatcher() {
        mockUIManagerToReturnNullEventDispatcher()

        callOnFragmentViewCreated(mock<ScreenStackFragment>(), mockScreenViewWithGenericContext())
    }

    private fun callOnFragmentViewCreated(
        mockFragment: Fragment,
        mockView: View,
        tracer: RNSentryReactFragmentLifecycleTracer = createSutWith(),
    ) {
        tracer.onFragmentViewCreated(
            mock(),
            mockFragment,
            mockView,
            null,
        )
    }

    private fun callOnFragmentViewDestroyed(
        mockFragment: Fragment,
        tracer: RNSentryReactFragmentLifecycleTracer = createSutWith(),
    ) {
        tracer.onFragmentViewDestroyed(mock(), mockFragment)
    }

    private fun dispatchEventNamed(
        eventName: String,
        mockEventDispatcher: EventDispatcher,
    ) = dispatchEvent(
        mock<Event<*>> {
            whenever(it.eventName).thenReturn(eventName)
        },
        mockEventDispatcher,
    )

    private fun dispatchEvent(
        event: Event<*>,
        mockEventDispatcher: EventDispatcher,
    ) {
        val listener = argumentCaptor<EventDispatcherListener>()
        verify(mockEventDispatcher, times(1)).addListener(listener.capture())
        listener.firstValue.onEventDispatch(event)
    }

    private fun createSutWith(): RNSentryReactFragmentLifecycleTracer {
        val logger: ILogger = mock()
        val buildInfo = BuildInfoProvider(logger)

        return RNSentryReactFragmentLifecycleTracer(
            buildInfo,
            mock(),
            logger,
        )
    }

    private fun mockScreenViewWithReactContext(): View {
        val screenMock: View =
            mock {
                whenever(it.id).thenReturn(123)
                whenever(it.context).thenReturn(mock<ReactContext>())
            }
        val mockView =
            mock<ViewGroup> {
                whenever(it.childCount).thenReturn(1)
                whenever(it.getChildAt(0)).thenReturn(screenMock)
            }
        return mockView
    }

    private fun mockScreenViewWithGenericContext(): View {
        val screenMock: View =
            mock {
                whenever(it.id).thenReturn(123)
                whenever(it.context).thenReturn(mock())
            }
        val mockView =
            mock<ViewGroup> {
                whenever(it.childCount).thenReturn(1)
                whenever(it.getChildAt(0)).thenReturn(screenMock)
            }
        return mockView
    }

    private fun mockScreenViewWithNoId(): View {
        val screenMock: View =
            mock {
                whenever(it.id).thenReturn(-1)
                whenever(it.context).thenReturn(mock<ReactContext>())
            }
        val mockView =
            mock<ViewGroup> {
                whenever(it.childCount).thenReturn(1)
                whenever(it.getChildAt(0)).thenReturn(screenMock)
            }
        return mockView
    }

    private fun mockScreenViewWithoutChild(): View =
        mock<ViewGroup> {
            whenever(it.childCount).thenReturn(0)
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
