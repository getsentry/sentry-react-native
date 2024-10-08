package io.sentry.rnsentryandroidtester

import io.sentry.Breadcrumb
import io.sentry.SentryLevel
import io.sentry.react.RNSentryReplayBreadcrumbConverter
import io.sentry.rrweb.RRWebBreadcrumbEvent
import io.sentry.rrweb.RRWebEventType
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class RNSentryReplayBreadcrumbConverterTest {

    @Test
    fun convertNavigationBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.level = SentryLevel.INFO
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "navigation"
        testBreadcrumb.setData("from", "HomeScreen")
        testBreadcrumb.setData("to", "ProfileScreen")
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals(SentryLevel.INFO, actual.level)
        assertEquals("navigation", actual.category)
        assertEquals("HomeScreen", actual.data?.get("from"))
        assertEquals("ProfileScreen", actual.data?.get("to"))
    }

    @Test
    fun convertNavigationBreadcrumbWithOnlyTo() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.level = SentryLevel.INFO
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "navigation"
        testBreadcrumb.setData("to", "ProfileScreen")
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals(SentryLevel.INFO, actual.level)
        assertEquals("navigation", actual.category)
        assertEquals(null, actual.data?.get("from"))
        assertEquals("ProfileScreen", actual.data?.get("to"))
    }

    @Test
    fun convertForegroundBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "app.lifecycle"
        testBreadcrumb.setData("state", "foreground");
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals("app.foreground", actual.category)
    }

    @Test
    fun convertBackgroundBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "navigation"
        testBreadcrumb.category = "app.lifecycle"
        testBreadcrumb.setData("state", "background");
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals("app.background", actual.category)
    }

    @Test
    fun doesNotConvertSentryEventBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb();
        testBreadcrumb.category = "sentry.event"
        val actual = converter.convert(testBreadcrumb)
        assertEquals(null, actual)
    }

    @Test
    fun doesNotConvertSentryTransactionBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb();
        testBreadcrumb.category = "sentry.transaction"
        val actual = converter.convert(testBreadcrumb)
        assertEquals(null, actual)
    }

    @Test
    fun convertTouchBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.level = SentryLevel.INFO
        testBreadcrumb.type = "user"
        testBreadcrumb.category = "touch"
        testBreadcrumb.message = "this won't be used for replay"
        testBreadcrumb.setData(
            "path",
            arrayListOf(mapOf(
                "element" to "element4",
                "file" to "file4")))
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals(SentryLevel.INFO, actual.level)
        assertEquals("ui.tap", actual.category)
        assertEquals(1, actual.data?.keys?.size)
        assertEquals(
            arrayListOf(mapOf(
                "element" to "element4",
                "file" to "file4")),
            actual.data?.get("path"))
    }

    @Test
    fun doesNotConvertNullPath() {
        val actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(null)
        assertEquals(null, actual)
    }

    @Test
    fun doesNotConvertPathContainingNull() {
        val actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(arrayListOf(arrayOfNulls<Any>(1)))
        assertEquals(null, actual)
    }

    @Test
    fun doesNotConvertPathWithValuesMissingNameAndLevel() {
        val actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(arrayListOf(mapOf(
            "element" to "element4",
            "file" to "file4")))
        assertEquals(null, actual)
    }

    @Test
    fun doesConvertValidPathExample1() {
        val actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(listOf(
            mapOf("label" to "label0"),
            mapOf("name" to "name1"),
            mapOf("name" to "item2", "label" to "label2"),
            mapOf("name" to "item3", "label" to "label3", "element" to "element3"),
            mapOf("name" to "item4", "label" to "label4", "file" to "file4"),
            mapOf("name" to "item5", "label" to "label5", "element" to "element5", "file" to "file5")))
        assertEquals("label3(element3) > label2 > name1 > label0", actual)
    }

    @Test
    fun doesConvertValidPathExample2() {
        val actual = RNSentryReplayBreadcrumbConverter.getTouchPathMessage(listOf(
            mapOf("name" to "item2", "label" to "label2"),
            mapOf("name" to "item3", "label" to "label3", "element" to "element3"),
            mapOf("name" to "item4", "label" to "label4", "file" to "file4"),
            mapOf("name" to "item5", "label" to "label5", "element" to "element5", "file" to "file5"),
            mapOf("label" to "label6"),
            mapOf("name" to "name7")))
        assertEquals("label5(element5, file5) > label4(file4) > label3(element3) > label2", actual)
    }

    private fun assertRRWebBreadcrumbDefaults(actual: RRWebBreadcrumbEvent) {
        assertEquals("default", actual.breadcrumbType)
        assertEquals(actual.breadcrumbTimestamp * 1000, actual.timestamp.toDouble(), 0.05)
        assert(actual.breadcrumbTimestamp > 0)
    }
}
