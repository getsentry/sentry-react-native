package io.sentry.react

import io.sentry.NoOpLogger
import io.sentry.SentryEvent
import io.sentry.SentryLevel
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Collections
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@RunWith(RobolectricTestRunner::class)
class RNSentryJSHangTrackerTest {
    private val trace =
        """
        {
          "samples": [
            { "sf": 3, "tid": "7", "ts": "1000" },
            { "sf": 4, "tid": "7", "ts": "2000" }
          ],
          "stackFrames": {
            "1": { "name": "[root]", "category": "root" },
            "2": { "name": "main(app:///index.android.bundle:1:1)", "category": "JavaScript", "parent": 1, "funcVirtAddr": "100", "offset": "5" },
            "3": { "name": "work(app:///index.android.bundle:1:1)", "category": "JavaScript", "parent": 2, "line": "10", "column": "20" },
            "4": { "name": "[Native] jsonStringify", "category": "Native", "parent": 3 }
          }
        }
        """.trimIndent()

    private val jsResponsive = AtomicBoolean(true)
    private val queuedOnJsThread = CopyOnWriteArrayList<Runnable>()
    private val paused = AtomicBoolean(false)
    private val samples = AtomicInteger(0)
    private val captured = CopyOnWriteArrayList<SentryEvent>()
    private var tracker: RNSentryJSHangTracker? = null

    @After
    fun tearDown() {
        tracker?.stop()
    }

    private fun createTracker(
        sampler: RNSentryJSHangTracker.Sampler =
            RNSentryJSHangTracker.Sampler {
                samples.incrementAndGet()
                trace
            },
    ): RNSentryJSHangTracker =
        RNSentryJSHangTracker(
            { runnable ->
                if (jsResponsive.get()) {
                    runnable.run()
                } else {
                    queuedOnJsThread.add(runnable)
                }
                true
            },
            sampler,
            { event -> captured.add(event) },
            { paused.get() },
            NoOpLogger.getInstance(),
        ).also { tracker = it }

    private fun unblockJsThread() {
        jsResponsive.set(true)
        queuedOnJsThread.forEach { it.run() }
        queuedOnJsThread.clear()
    }

    private fun waitUntil(
        timeoutMs: Long = 3000,
        condition: () -> Boolean,
    ): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return true
            Thread.sleep(20)
        }
        return condition()
    }

    @Test
    fun `reports one hang when the JS thread stops answering`() {
        createTracker().start(300, "debug-id")
        Thread.sleep(250)

        jsResponsive.set(false)

        assertTrue(waitUntil { captured.size == 1 })
        Thread.sleep(600)
        assertEquals(1, captured.size)
        assertEquals(1, samples.get())
        val exception = captured[0].exceptions!!.single()
        assertEquals("JS Thread Hang", exception.type)
        assertEquals(listOf("main", "work"), exception.stacktrace!!.frames!!.map { it.function })
    }

    @Test
    fun `reports again only after the JS thread recovered`() {
        createTracker().start(300, null)
        Thread.sleep(250)
        jsResponsive.set(false)
        assertTrue(waitUntil { captured.size == 1 })

        unblockJsThread()
        Thread.sleep(300)
        jsResponsive.set(false)

        assertTrue(waitUntil { captured.size == 2 })
    }

    @Test
    fun `does not report before the JS thread answered once`() {
        jsResponsive.set(false)

        createTracker().start(300, null)

        Thread.sleep(800)
        assertEquals(0, captured.size)
        assertEquals(0, samples.get())
    }

    @Test
    fun `does not report while paused`() {
        createTracker().start(300, null)
        Thread.sleep(250)

        paused.set(true)
        jsResponsive.set(false)

        Thread.sleep(800)
        assertEquals(0, captured.size)
    }

    @Test
    fun `stop ends a running sample and waits for the tracker thread`() {
        val sampling = CountDownLatch(1)
        val sampleInterrupted = AtomicBoolean(false)
        val tracker =
            createTracker(
                RNSentryJSHangTracker.Sampler {
                    sampling.countDown()
                    try {
                        Thread.sleep(10_000)
                    } catch (e: InterruptedException) {
                        sampleInterrupted.set(true)
                        Thread.currentThread().interrupt()
                    }
                    trace
                },
            )
        tracker.start(300, null)
        Thread.sleep(250)
        jsResponsive.set(false)
        assertTrue(sampling.await(3, TimeUnit.SECONDS))

        val start = System.nanoTime()
        tracker.stop()

        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 1000)
        assertTrue(sampleInterrupted.get())
        assertFalse(tracker.isRunning)
        assertEquals(0, captured.size)
    }

    @Test
    fun `start restarts a running tracker`() {
        val tracker = createTracker()
        tracker.start(300, null)
        tracker.start(300, null)

        assertTrue(tracker.isRunning)
        tracker.stop()
        assertFalse(tracker.isRunning)
    }

    @Test
    fun `takes the oldest JS stack and leaves out native and root frames`() {
        val frames = RNSentryJSHangTracker.framesFromHermesTrace(trace)

        assertEquals(listOf("main", "work"), frames.map { it.function })
        assertEquals(1, frames[0].lineno)
        assertEquals(106, frames[0].colno)
        assertEquals(10, frames[1].lineno)
        assertEquals(20, frames[1].colno)
        assertTrue(frames.all { it.filename == "app:///index.android.bundle" && it.platform == "javascript" })
    }

    @Test
    fun `gives no frames for an invalid trace`() {
        assertTrue(RNSentryJSHangTracker.framesFromHermesTrace("not json").isEmpty())
        assertTrue(RNSentryJSHangTracker.framesFromHermesTrace("""{"samples":"x"}""").isEmpty())
    }

    @Test
    fun `creates a handled JS hang event with the bundle Debug ID`() {
        val frames = RNSentryJSHangTracker.framesFromHermesTrace(trace)

        val event = RNSentryJSHangTracker.createEvent(2000, frames, "debug-id")

        assertEquals(SentryLevel.ERROR, event.level)
        val exception = event.exceptions!!.single()
        assertEquals("JS Thread Hang", exception.type)
        assertEquals("JS thread blocked for at least 2000 ms.", exception.value)
        assertEquals("JSHang", exception.mechanism!!.type)
        assertEquals(true, exception.mechanism!!.isHandled)
        val thread = event.threads!!.single()
        assertEquals("JavaScript", thread.name)
        assertEquals(false, thread.isMain)
        assertEquals(exception.stacktrace, thread.stacktrace)
        val image = event.debugMeta!!.images!!.single()
        assertEquals("sourcemap", image.type)
        assertEquals("debug-id", image.debugId)
        assertEquals("app:///index.android.bundle", image.codeFile)
    }

    @Test
    fun `creates an event without a stack and Debug ID when they are missing`() {
        val event = RNSentryJSHangTracker.createEvent(2000, Collections.emptyList(), null)

        assertNull(event.exceptions!!.single().stacktrace)
        assertNull(event.debugMeta)
    }

    @Test
    fun `maps an anonymous Hermes frame without a function name`() {
        val frame =
            RNSentryJSHangTracker.frameFromHermesFrame(
                JSONObject("""{"name":"(app:///index.android.bundle:1:1)","category":"JavaScript","line":"3","column":"4"}"""),
            )

        assertNotNull(frame)
        assertNull(frame!!.function)
        assertEquals(3, frame.lineno)
    }
}
