package io.sentry.react

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class RNSentryTimeToDisplayTest {
    companion object {
        val TEST_ID = "test-id"
        val TEST_VAL = 123.4
    }

    @Before
    fun setUp() {
    }

    @Test
    fun `puts and pops record`() {
        RNSentryTimeToDisplay.putTimeToDisplayFor(TEST_ID, TEST_VAL)

        val firstPop = RNSentryTimeToDisplay.popTimeToDisplayFor(TEST_ID)
        val secondPop = RNSentryTimeToDisplay.popTimeToDisplayFor(TEST_ID)

        assertEquals(firstPop, TEST_VAL, 0.0)
        assertNull(secondPop)
    }

    @Test
    fun `removes oldes entry when full`() {
        val maxSize = RNSentryTimeToDisplay.ENTRIES_MAX_SIZE + 1
        for (i in 1..maxSize) {
            RNSentryTimeToDisplay.putTimeToDisplayFor("$TEST_ID-$i", i.toDouble())
        }

        val oldestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-1")
        val secondOldestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-2")
        val newestEntry = RNSentryTimeToDisplay.popTimeToDisplayFor("$TEST_ID-$maxSize")

        assertNull(oldestEntry)
        assertNotNull(secondOldestEntry)
        assertNotNull(newestEntry)
    }
}
