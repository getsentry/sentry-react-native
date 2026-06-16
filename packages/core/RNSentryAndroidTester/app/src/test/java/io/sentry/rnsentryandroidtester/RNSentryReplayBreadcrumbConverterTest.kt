package io.sentry.rnsentryandroidtester

import io.sentry.Breadcrumb
import io.sentry.SentryLevel
import io.sentry.react.RNSentryReplayBreadcrumbConverter
import io.sentry.rrweb.RRWebBreadcrumbEvent
import io.sentry.rrweb.RRWebSpanEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
        testBreadcrumb.setData("state", "foreground")
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
        testBreadcrumb.setData("state", "background")
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals("app.background", actual.category)
    }

    @Test
    fun convertDeviceOrientationBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "device.orientation"
        testBreadcrumb.setData("orientation", "portrait")
        val actual = converter.convert(testBreadcrumb)

        assertNotNull("device.orientation breadcrumbs should pass through to the default converter", actual)
    }

    @Test
    fun convertDeviceConnectivityBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "device.connectivity"
        testBreadcrumb.setData("connectivity", "wifi")
        val actual = converter.convert(testBreadcrumb)

        assertNotNull("device.connectivity breadcrumbs should pass through to the default converter", actual)
    }

    @Test
    fun convertDeviceEventBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.type = "system"
        testBreadcrumb.category = "device.event"
        testBreadcrumb.setData("action", "LOW_MEMORY")
        val actual = converter.convert(testBreadcrumb)

        assertNotNull("device.event breadcrumbs should pass through to the default converter", actual)
    }

    @Test
    fun doesNotConvertSentryEventBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "sentry.event"
        val actual = converter.convert(testBreadcrumb)
        assertEquals(null, actual)
    }

    @Test
    fun doesNotConvertSentryTransactionBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "sentry.transaction"
        val actual = converter.convert(testBreadcrumb)
        assertEquals(null, actual)
    }

    @Test
    fun convertMultiClickBreadcrumb() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.level = SentryLevel.WARNING
        testBreadcrumb.type = "default"
        testBreadcrumb.category = "ui.multiClick"
        testBreadcrumb.message = "Submit"
        testBreadcrumb.setData(
            "path",
            arrayListOf(
                mapOf(
                    "name" to "SubmitButton",
                    "label" to "Submit",
                    "file" to "form.tsx",
                ),
            ),
        )
        testBreadcrumb.setData("clickCount", 3.0)
        testBreadcrumb.setData("metric", true)
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals(SentryLevel.WARNING, actual.level)
        assertEquals("ui.multiClick", actual.category)
        assertEquals("Submit(form.tsx)", actual.message)
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
            arrayListOf(
                mapOf(
                    "element" to "element4",
                    "file" to "file4",
                ),
            ),
        )
        val actual = converter.convert(testBreadcrumb) as RRWebBreadcrumbEvent

        assertRRWebBreadcrumbDefaults(actual)
        assertEquals(SentryLevel.INFO, actual.level)
        assertEquals("ui.tap", actual.category)
        assertEquals(1, actual.data?.keys?.size)
        assertEquals(
            arrayListOf(
                mapOf(
                    "element" to "element4",
                    "file" to "file4",
                ),
            ),
            actual.data?.get("path"),
        )
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
        val actual =
            RNSentryReplayBreadcrumbConverter.getTouchPathMessage(
                arrayListOf(
                    mapOf(
                        "element" to "element4",
                        "file" to "file4",
                    ),
                ),
            )
        assertEquals(null, actual)
    }

    @Test
    fun doesConvertValidPathExample1() {
        val actual =
            RNSentryReplayBreadcrumbConverter.getTouchPathMessage(
                listOf(
                    mapOf("label" to "label0"),
                    mapOf("name" to "name1"),
                    mapOf("name" to "item2", "label" to "label2"),
                    mapOf("name" to "item3", "label" to "label3", "element" to "element3"),
                    mapOf("name" to "item4", "label" to "label4", "file" to "file4"),
                    mapOf("name" to "item5", "label" to "label5", "element" to "element5", "file" to "file5"),
                ),
            )
        assertEquals("label3(element3) > label2 > name1 > label0", actual)
    }

    @Test
    fun doesConvertValidPathExample2() {
        val actual =
            RNSentryReplayBreadcrumbConverter.getTouchPathMessage(
                listOf(
                    mapOf("name" to "item2", "label" to "label2"),
                    mapOf("name" to "item3", "label" to "label3", "element" to "element3"),
                    mapOf("name" to "item4", "label" to "label4", "file" to "file4"),
                    mapOf("name" to "item5", "label" to "label5", "element" to "element5", "file" to "file5"),
                    mapOf("label" to "label6"),
                    mapOf("name" to "name7"),
                ),
            )
        assertEquals("label5(element5, file5) > label4(file4) > label3(element3) > label2", actual)
    }

    @Test
    fun convertNetworkBreadcrumbForwardsBodyAndHeadersAndStripsMeta() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "xhr"
        testBreadcrumb.setData("url", "https://api.example.com/users")
        testBreadcrumb.setData("method", "POST")
        testBreadcrumb.setData("start_timestamp", 1_000.0)
        testBreadcrumb.setData("end_timestamp", 2_000.0)
        testBreadcrumb.setData(
            "request",
            mapOf(
                "body" to "{\"hello\":\"world\"}",
                "headers" to mapOf("content-type" to "application/json"),
                "_meta" to mapOf("warnings" to listOf("MAX_BODY_SIZE_EXCEEDED")),
            ),
        )
        testBreadcrumb.setData(
            "response",
            mapOf(
                "body" to "[UNPARSEABLE_BODY_TYPE]",
                "_meta" to mapOf("warnings" to listOf("UNPARSEABLE_BODY_TYPE")),
            ),
        )

        val actual = converter.convertNetworkBreadcrumb(testBreadcrumb) as RRWebSpanEvent
        val data = actual.data!!

        @Suppress("UNCHECKED_CAST")
        val request = data["request"] as Map<Any, Any>
        assertEquals("{\"hello\":\"world\"}", request["body"])
        assertEquals(mapOf("content-type" to "application/json"), request["headers"])
        assertNull("_meta must be stripped before forwarding to native rrweb", request["_meta"])

        @Suppress("UNCHECKED_CAST")
        val response = data["response"] as Map<Any, Any>
        assertEquals("[UNPARSEABLE_BODY_TYPE]", response["body"])
        assertNull(response["_meta"])
    }

    @Test
    fun convertNetworkBreadcrumbDropsSideThatIsEmptyAfterMetaStrip() {
        val converter = RNSentryReplayBreadcrumbConverter()
        val testBreadcrumb = Breadcrumb()
        testBreadcrumb.category = "xhr"
        testBreadcrumb.setData("url", "https://api.example.com/users")
        testBreadcrumb.setData("start_timestamp", 1_000.0)
        testBreadcrumb.setData("end_timestamp", 2_000.0)
        // Request side contains only `_meta` — once stripped, nothing remains.
        testBreadcrumb.setData(
            "request",
            mapOf("_meta" to mapOf("warnings" to listOf("UNPARSEABLE_BODY_TYPE"))),
        )
        // Response side is not a map (or missing) — should also be dropped.
        testBreadcrumb.setData("response", "not-a-map")

        val actual = converter.convertNetworkBreadcrumb(testBreadcrumb) as RRWebSpanEvent
        val data = actual.data!!

        assertTrue("empty-after-strip request side must be omitted", !data.containsKey("request"))
        assertTrue("non-map response side must be omitted", !data.containsKey("response"))
    }

    private fun assertRRWebBreadcrumbDefaults(actual: RRWebBreadcrumbEvent) {
        assertEquals("default", actual.breadcrumbType)
        assertEquals(actual.breadcrumbTimestamp * 1000, actual.timestamp.toDouble(), 0.05)
        assert(actual.breadcrumbTimestamp > 0)
    }
}
