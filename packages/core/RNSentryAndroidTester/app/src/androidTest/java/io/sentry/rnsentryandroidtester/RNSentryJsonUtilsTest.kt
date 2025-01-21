package io.sentry.rnsentryandroidtester

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.soloader.SoLoader
import io.sentry.react.RNSentryJsonUtils
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RNSentryJsonUtilsTest {
    @Before
    fun setUp() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        SoLoader.init(context, false)
    }

    @Test
    fun testJsonObjectToReadableMap() {
        val json =
            JSONObject().apply {
                put("stringKey", "stringValue")
                put("booleanKey", true)
                put("intKey", 123)
            }

        val result = RNSentryJsonUtils.jsonObjectToReadableMap(json)

        assertNotNull(result)
        assertTrue(result is JavaOnlyMap)
        assertEquals("stringValue", result?.getString("stringKey"))
        assertEquals(true, result?.getBoolean("booleanKey"))
        assertEquals(123, result?.getInt("intKey"))
    }

    @Test
    fun testNestedJsonObjectToReadableMap() {
        val json =
            JSONObject().apply {
                put("stringKey", "stringValue")
                put("booleanKey", true)
                put("intKey", 123)
                put(
                    "nestedKey",
                    JSONObject().apply {
                        put("nestedStringKey", "nestedStringValue")
                        put("nestedBooleanKey", false)
                        put(
                            "deepNestedArrayKey",
                            JSONArray().apply {
                                put("deepNestedArrayValue")
                            },
                        )
                    },
                )
                put(
                    "arrayKey",
                    JSONArray().apply {
                        put("arrayStringValue")
                        put(789)
                        put(
                            JSONObject().apply {
                                put("deepNestedStringKey", "deepNestedStringValue")
                                put("deepNestedBooleanKey", false)
                            },
                        )
                    },
                )
            }

        val result = RNSentryJsonUtils.jsonObjectToReadableMap(json)

        assertNotNull(result)
        assertTrue(result is JavaOnlyMap)
        assertEquals("stringValue", result?.getString("stringKey"))
        assertEquals(true, result?.getBoolean("booleanKey"))
        assertEquals(123, result?.getInt("intKey"))
        val nested = result?.getMap("nestedKey")
        assertNotNull(nested)
        assertEquals("nestedStringValue", nested?.getString("nestedStringKey"))
        assertEquals(false, nested?.getBoolean("nestedBooleanKey"))
        val deepNestedArray = nested?.getArray("deepNestedArrayKey")
        assertNotNull(deepNestedArray)
        assertEquals("deepNestedArrayValue", deepNestedArray?.getString(0))
        val array = result?.getArray("arrayKey")
        assertNotNull(array)
        assertEquals("arrayStringValue", array?.getString(0))
        assertEquals(789, array?.getInt(1))
        val deepNested = array?.getMap(2)
        assertNotNull(deepNested)
        assertEquals("deepNestedStringValue", deepNested?.getString("deepNestedStringKey"))
        assertEquals(false, deepNested?.getBoolean("deepNestedBooleanKey"))
    }
}
