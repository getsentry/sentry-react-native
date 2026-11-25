package io.sentry.react

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.io.IOException
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch

@RunWith(RobolectricTestRunner::class)
class RNSentryHermesSamplerTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val calls = CopyOnWriteArrayList<String>()

    private val fakeProfiler =
        object : RNSentryHermesSampler.Profiler {
            override fun enable() {
                calls.add("enable")
            }

            override fun disable() {
                calls.add("disable")
            }

            override fun dumpSampledTraceToFile(path: String) {
                calls.add("dump")
                File(path).writeText("""{"samples":[]}""")
            }
        }

    @Before
    fun setUp() {
        RNSentryHermesSampler.setProfiler(fakeProfiler)
    }

    @After
    fun tearDown() {
        RNSentryHermesSampler.disableProfiling()
        RNSentryHermesSampler.setProfiler(null)
    }

    @Test
    fun `sample enables, disables, and dumps the sampler`() {
        val trace = RNSentryHermesSampler.sample(10, folder.root)

        assertEquals(listOf("enable", "disable", "dump"), calls)
        assertEquals("""{"samples":[]}""", trace!!.trim())
        assertTrue(folder.root.listFiles()!!.isEmpty())
    }

    @Test
    fun `an interrupt ends the sample and the sampler is off`() {
        val started = CountDownLatch(1)
        val thread =
            Thread {
                started.countDown()
                RNSentryHermesSampler.sample(10_000, folder.root)
            }
        thread.start()
        started.await()
        while (!calls.contains("enable")) Thread.sleep(5)

        thread.interrupt()
        thread.join(1000)

        assertFalse(thread.isAlive)
        assertEquals("disable", calls[1])
    }

    @Test
    fun `sample does not touch the sampler while a profile runs`() {
        RNSentryHermesSampler.startProfiling()
        calls.clear()

        assertNull(RNSentryHermesSampler.sample(10, folder.root))
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `a profile cannot start in the middle of a sample`() {
        val sampling = Thread { RNSentryHermesSampler.sample(300, folder.root) }
        sampling.start()
        while (!calls.contains("enable")) Thread.sleep(5)

        RNSentryHermesSampler.startProfiling()

        assertEquals(listOf("enable", "disable", "dump", "disable", "enable"), calls)
        sampling.join(1000)
        assertFalse(sampling.isAlive)
    }

    @Test
    fun `stopProfiling disables the sampler even when the trace file cannot be created`() {
        RNSentryHermesSampler.startProfiling()
        calls.clear()

        try {
            RNSentryHermesSampler.stopProfiling(File(folder.root, "missing"))
            fail("Expected an IOException")
        } catch (e: IOException) {
            assertEquals(listOf("disable"), calls)
        }
    }

    @Test
    fun `stopProfiling returns the dumped trace`() {
        RNSentryHermesSampler.startProfiling()

        val trace = RNSentryHermesSampler.stopProfiling(folder.root)

        assertEquals(listOf("disable", "enable", "disable", "dump"), calls)
        assertTrue(trace.readText().contains("samples"))
    }
}
