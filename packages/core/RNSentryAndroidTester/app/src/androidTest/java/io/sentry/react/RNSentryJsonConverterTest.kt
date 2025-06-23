package io.sentry.react

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import io.sentry.react.RNSentryJsonConverter.convertToWritable
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RNSentryJsonConverterTest {
    @Test
    fun testConvertToWritableWithSimpleJsonObject() {
        val jsonObject =
            JSONObject().apply {
                put("floatKey", 12.3f)
                put("doubleKey", 12.3)
                put("intKey", 123)
                put("stringKey", "test")
                put("nullKey", JSONObject.NULL)
            }

        val result: WritableMap? = convertToWritable(jsonObject)

        assertNotNull(result)
        assertEquals(12.3, result!!.getDouble("floatKey"), 0.0001)
        assertEquals(12.3, result.getDouble("doubleKey"), 0.0)
        assertEquals(123, result.getInt("intKey"))
        assertEquals("test", result.getString("stringKey"))
        assertNull(result.getString("nullKey"))
    }

    @Test
    fun testConvertToWritableWithNestedJsonObject() {
        val jsonObject =
            JSONObject().apply {
                put(
                    "nested",
                    JSONObject().apply {
                        put("key", "value")
                    },
                )
            }

        val result: WritableMap? = convertToWritable(jsonObject)

        assertNotNull(result)
        val nestedMap = result!!.getMap("nested")
        assertNotNull(nestedMap)
        assertEquals("value", nestedMap!!.getString("key"))
    }

    @Test
    fun testConvertToWritableWithJsonArray() {
        val jsonArray =
            JSONArray().apply {
                put(1)
                put(2.5)
                put("string")
                put(JSONObject.NULL)
            }

        val result: WritableArray = convertToWritable(jsonArray)

        assertEquals(1, result.getInt(0))
        assertEquals(2.5, result.getDouble(1), 0.0)
        assertEquals("string", result.getString(2))
        assertNull(result.getString(3))
    }

    @Test
    fun testConvertToWritableWithNestedJsonArray() {
        val jsonObject =
            JSONObject().apply {
                put(
                    "array",
                    JSONArray().apply {
                        put(
                            JSONObject().apply {
                                put("key1", "value1")
                            },
                        )
                        put(
                            JSONObject().apply {
                                put("key2", "value2")
                            },
                        )
                    },
                )
            }

        val result: WritableMap? = convertToWritable(jsonObject)

        val array = result?.getArray("array")
        assertEquals("value1", array?.getMap(0)?.getString("key1"))
        assertEquals("value2", array?.getMap(1)?.getString("key2"))
    }
}
