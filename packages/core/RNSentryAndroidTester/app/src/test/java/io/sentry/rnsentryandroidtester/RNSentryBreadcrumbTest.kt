package io.sentry.rnsentryandroidtester

import com.facebook.react.bridge.JavaOnlyMap
import io.sentry.react.RNSentryBreadcrumb
import junit.framework.TestCase.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class RNSentryBreadcrumbTest {

    @Test
    fun nullForMissingCategory() {
        val map = JavaOnlyMap.of()
        val actual = RNSentryBreadcrumb.getCurrentScreenFrom(map)
        assertEquals(null, actual)
    }


    @Test
    fun nullForNonNavigationCategory() {
        val map = JavaOnlyMap.of(
            "category", "unknown"
        )
        val actual = RNSentryBreadcrumb.getCurrentScreenFrom(map)
        assertEquals(null, actual)
    }


    @Test
    fun nullForMissingData() {
        val map = JavaOnlyMap.of(
            "category", "navigation"
        )
        val actual = RNSentryBreadcrumb.getCurrentScreenFrom(map)
        assertEquals(null, actual)
    }


    @Test
    fun nullForNonStringDataToKey() {
        val map = JavaOnlyMap.of(
            "category", "unknown",
            "data", mapOf(
                "to" to 123,
            ),
        )
        val actual = RNSentryBreadcrumb.getCurrentScreenFrom(map)
        assertEquals(null, actual)
    }

    @Test
    fun screenNameForValidNavigationBreadcrumb() {
        val map = JavaOnlyMap.of(
            "category", "navigation",
            "data", JavaOnlyMap.of(
                "to", "newScreen",
            ),
        )
        val actual = RNSentryBreadcrumb.getCurrentScreenFrom(map)
        assert(actual is String)
        assertEquals("newScreen", actual)
    }

}
