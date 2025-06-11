package io.sentry.react

import android.app.Activity
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.facebook.react.bridge.ReactApplicationContext
import io.sentry.android.core.BuildInfoProvider
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.mock
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryOnDrawReporterTest {
    companion object {
        private const val TTID_PREFIX = RNSentryOnDrawReporterManager.TTID_PREFIX
        private const val TTFD_PREFIX = RNSentryOnDrawReporterManager.TTFD_PREFIX
        private const val SPAN_ID = "test-span-id"
        private const val NEW_SPAN_ID = "new-test-span-id"
    }

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
    }

    @Test
    fun `when parentSpanId and timeToFullDisplay are set the next render timestamp is saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(SPAN_ID)

        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID))
    }

    @Test
    fun `when parentSpanId and timeToInitialDisplay are set the next render timestamp is saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(SPAN_ID)

        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID))
    }

    @Test
    fun `when parentSpanId and timeToFullDisplay are set the next render timestamp is saved - reversed order`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setParentSpanId(SPAN_ID)
        reporter.setFullDisplay(true)

        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID))
    }

    @Test
    fun `when parentSpanId and timeToInitialDisplay are set the next render timestamp is saved - reversed order`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setParentSpanId(SPAN_ID)
        reporter.setInitialDisplay(true)

        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID))
    }

    @Test
    fun `when display flag and parentSpanId changes the next full display render is saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID)

        reporter.setFullDisplay(false)
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(NEW_SPAN_ID)
        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + NEW_SPAN_ID))
    }

    @Test
    fun `when display flag and parentSpanId changes the next initial display render is saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID)

        reporter.setInitialDisplay(false)
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(NEW_SPAN_ID)
        assertNotNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + NEW_SPAN_ID))
    }

    @Test
    fun `when parentSpanId doesn't change the next full display render is not saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID)

        reporter.setFullDisplay(false)
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        assertNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID))
    }

    @Test
    fun `when parentSpanId doesn't change the next initial display render is not saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID)

        reporter.setInitialDisplay(false)
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        assertNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID))
    }

    @Test
    fun `when display flag doesn't change the next full display render is not saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setFullDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID)

        reporter.setFullDisplay(true)
        assertNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTFD_PREFIX + SPAN_ID))
    }

    @Test
    fun `when display flag doesn't change the next initial display render is not saved`() {
        val reporter = createTestRNSentryOnDrawReporterView()
        reporter.setInitialDisplay(true)
        reporter.setParentSpanId(SPAN_ID)
        RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID)

        reporter.setInitialDisplay(true)
        assertNull(RNSentryTimeToDisplay.popTimeToDisplayFor(TTID_PREFIX + SPAN_ID))
    }

    class TestRNSentryOnDrawReporterView(
        context: Context,
        reactContext: ReactApplicationContext,
        buildInfo: BuildInfoProvider,
    ) : RNSentryOnDrawReporterManager.RNSentryOnDrawReporterView(context, reactContext, buildInfo) {
        override fun registerForNextDraw(
            activity: Activity,
            callback: Runnable,
            buildInfo: BuildInfoProvider,
        ) {
            callback.run()
        }
    }

    private fun createTestRNSentryOnDrawReporterView(): TestRNSentryOnDrawReporterView =
        TestRNSentryOnDrawReporterView(ApplicationProvider.getApplicationContext(), mockReactContext(), mockBuildInfo())

    private fun mockReactContext(): ReactApplicationContext {
        val reactContext = mock<ReactApplicationContext>()
        whenever(reactContext.getCurrentActivity()).thenReturn(mock<Activity>())
        return reactContext
    }

    private fun mockBuildInfo(): BuildInfoProvider = mock()
}
