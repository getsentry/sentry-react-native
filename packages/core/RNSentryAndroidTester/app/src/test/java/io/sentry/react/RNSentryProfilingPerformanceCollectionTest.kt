package io.sentry.react

import io.sentry.CompositePerformanceCollector
import io.sentry.IScopes
import io.sentry.PerformanceCollectionData
import io.sentry.Sentry
import io.sentry.android.core.AndroidProfiler
import io.sentry.android.core.SentryAndroidOptions
import org.junit.After
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.MockedStatic
import org.mockito.Mockito.mockStatic
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Verifies the CPU/memory performance collection paired with the Android profiler, which feeds
 * the profile's cpu_usage and memory_footprint measurements. Collections started by id never time
 * out on their own, so every exit path must stop them.
 *
 * startProfiling()/stopProfiling() allocate WritableNativeMap and calls HermesSamplingProfiler, both JNI-backed
 * and not loadable or mockable in a JVM test, so it is covered on-device instead.
 */
@RunWith(RobolectricTestRunner::class)
class RNSentryProfilingPerformanceCollectionTest {
    private lateinit var collector: CompositePerformanceCollector
    private lateinit var module: RNSentryModuleImpl
    private lateinit var sentryMock: MockedStatic<Sentry>

    @Before
    fun setUp() {
        collector = mock()
        val options = SentryAndroidOptions().apply { setCompositePerformanceCollector(collector) }
        val scopes = mock<IScopes>()
        whenever(scopes.options).thenReturn(options)

        sentryMock = mockStatic(Sentry::class.java)
        sentryMock.`when`<IScopes> { Sentry.getCurrentScopes() }.thenReturn(scopes)

        module = Utils.createRNSentryModuleWithMockedContext()
    }

    @After
    fun tearDown() {
        sentryMock.close()
    }

    @Test
    fun `stop returns the data collected under the started id`() {
        val data = listOf(PerformanceCollectionData(1L))
        whenever(collector.stop(any<String>())).thenReturn(data)

        module.startPerformanceCollection()
        val result = module.stopPerformanceCollection()

        val startId = argumentCaptor<String>()
        verify(collector).start(startId.capture())
        verify(collector).stop(eq(startId.firstValue))
        assertSame(data, result)
    }

    @Test
    fun `stop without a running collection returns null`() {
        assertNull(module.stopPerformanceCollection())
        verify(collector, never()).stop(any<String>())
    }

    @Test
    fun `stop is idempotent`() {
        module.startPerformanceCollection()
        module.stopPerformanceCollection()
        assertNull(module.stopPerformanceCollection())

        verify(collector, times(1)).stop(any<String>())
    }

    @Test
    fun `starting again stops the previous collection`() {
        module.startPerformanceCollection()
        module.startPerformanceCollection()

        val startIds = argumentCaptor<String>()
        verify(collector, times(2)).start(startIds.capture())
        verify(collector).stop(eq(startIds.firstValue))
        verify(collector, never()).stop(eq(startIds.secondValue))
    }

    @Test
    fun `a failing collector start is swallowed and leaves nothing to stop`() {
        doThrow(RuntimeException("boom")).whenever(collector).start(any<String>())

        module.startPerformanceCollection()

        assertNull(module.stopPerformanceCollection())
        verify(collector, never()).stop(any<String>())
    }

    @Test
    fun `a failing collector stop is swallowed`() {
        whenever(collector.stop(any<String>())).thenThrow(RuntimeException("boom"))

        module.startPerformanceCollection()

        assertNull(module.stopPerformanceCollection())
    }

    @Test
    fun `invalidate stops the performance collection`() {
        val profiler = mock<AndroidProfiler>()
        seedRunningProfiler(profiler)
        module.startPerformanceCollection()

        // HermesSamplingProfiler.disable() fails in the JVM; invalidate() catches it.
        module.invalidate()

        val startId = argumentCaptor<String>()
        verify(collector).start(startId.capture())
        verify(collector).stop(eq(startId.firstValue))
        verify(profiler).endAndCollect(eq(false), anyOrNull())
    }

    private fun seedRunningProfiler(profiler: AndroidProfiler) {
        @Suppress("UNCHECKED_CAST")
        (field("androidProfiler") as AtomicReference<AndroidProfiler>).set(profiler)
        (field("isProfiling") as AtomicBoolean).set(true)
    }

    private fun field(name: String): Any =
        RNSentryModuleImpl::class.java
            .getDeclaredField(name)
            .apply { isAccessible = true }
            .get(module)!!
}
