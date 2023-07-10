package io.sentry.rnsentryandroidtester

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Arguments
import com.facebook.soloader.SoLoader
import io.sentry.react.MapConverter
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import android.content.Context;
import org.junit.Before
import java.math.BigDecimal

class Unknown


@RunWith(AndroidJUnit4::class)
class MapConverterTest {

    @Before
    fun setUp() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        SoLoader.init(context, false)
    }

    @Test
    fun converts_unknown_value_to_null() {
        val actual = MapConverter.convertToWritable(Unknown())
        assertNull(actual)
    }

    @Test
    fun converts_float_to_double() {
        val actual = MapConverter.convertToWritable(Float.MAX_VALUE)
        assert(actual is Double)
        assertEquals(Float.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun converts_byte_to_int() {
        val actual = MapConverter.convertToWritable(Byte.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Byte.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun converts_short_to_int() {
        val actual = MapConverter.convertToWritable(Short.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Short.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun converts_long_to_null() {
        // we can only transfer int and that would loose the value
        val actual = MapConverter.convertToWritable(Long.MAX_VALUE)
        assertNull(actual)
    }

    @Test
    fun converts_big_decimal_to_null() {
        val actual = MapConverter.convertToWritable(BigDecimal.TEN)
        assertNull(actual)
    }

    @Test
    fun keeps_null() {
        val actual = MapConverter.convertToWritable(null)
        assertNull(actual)
    }

    @Test
    fun keeps_boolean() {
        val actual = MapConverter.convertToWritable(true)
        assertEquals(true, actual)
    }

    @Test
    fun keeps_double() {
        val actual = MapConverter.convertToWritable(Double.MAX_VALUE)
        assertEquals(Double.MAX_VALUE, actual)
    }

    @Test
    fun keeps_integer() {
        val actual = MapConverter.convertToWritable(Integer.MAX_VALUE)
        assertEquals(Integer.MAX_VALUE, actual)
    }

    @Test
    fun keeps_string() {
        val actual = MapConverter.convertToWritable("string")
        assertEquals("string", actual)
    }

    @Test
    fun converts_map_with_unknown_value_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("unknown" to Unknown()))
        val expectedMap = Arguments.createMap();
        expectedMap.putNull("unknown")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_null_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("null" to null))
        val expectedMap = Arguments.createMap();
        expectedMap.putNull("null")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_boolean_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("boolean" to true))
        val expectedMap = Arguments.createMap();
        expectedMap.putBoolean("boolean", true)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_double_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("double" to Double.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("double", Double.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_integer_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("integer" to Integer.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putInt("integer", Integer.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_string_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("string" to "string"))
        val expectedMap = Arguments.createMap();
        expectedMap.putString("string", "string")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_null_array_list_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("array" to listOf(null)))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushNull()
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_boolean_array_list_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("array" to listOf(true)))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushBoolean(true)
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_double_array_list_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("array" to listOf(Double.MAX_VALUE)))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushDouble(Double.MAX_VALUE)
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_integer_array_list_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("array" to listOf(Integer.MAX_VALUE)))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushInt(Integer.MAX_VALUE)
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_nested_map_key() {
        val actualMap = MapConverter.convertToWritable(mapOf("map" to mapOf<String, Any>()))
        val expectedMap = Arguments.createMap()
        val expectedNestedMap = Arguments.createMap()
        expectedMap.putMap("map", expectedNestedMap)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_nested_lists() {
        val actual = MapConverter.convertToWritable(listOf(listOf<String>()))
        val expectedArray = Arguments.createArray()
        val expectedNestedArray = Arguments.createArray()
        expectedArray.pushArray(expectedNestedArray)
        assertEquals(actual, expectedArray)
    }

    @Test
    fun converts_complex_map_correctly() {
        val actual = MapConverter.convertToWritable(mapOf(
            "integer" to Integer.MAX_VALUE,
            "string" to "string1",
            "map" to mapOf(
                "integer" to Integer.MAX_VALUE,
                "string" to "string2",
                "map" to mapOf(
                    "integer" to Integer.MAX_VALUE,
                    "string" to "string3"
                )
            ),
            "list" to listOf(
                Integer.MAX_VALUE,
                mapOf(
                    "integer" to Integer.MAX_VALUE,
                    "string" to "string4",
                ),
                "string5",
            ),
        ))

        val expectedMap1 = Arguments.createMap()
        val expectedMap2 = Arguments.createMap()
        val expectedMap3 = Arguments.createMap()
        val expectedMap4 = Arguments.createMap()
        val expectedArray = Arguments.createArray()

        // the order of assembling the objects matters
        // for the comparison at the end of the test
        expectedMap4.putInt("integer", Integer.MAX_VALUE)
        expectedMap4.putString("string", "string4")

        expectedArray.pushInt(Integer.MAX_VALUE)
        expectedArray.pushMap(expectedMap4)
        expectedArray.pushString("string5")

        expectedMap3.putInt("integer", Integer.MAX_VALUE)
        expectedMap3.putString("string", "string3")

        expectedMap2.putInt("integer", Integer.MAX_VALUE)
        expectedMap2.putString("string", "string2")
        expectedMap2.putMap("map", expectedMap3)

        expectedMap1.putInt("integer", Integer.MAX_VALUE)
        expectedMap1.putArray("list", expectedArray)
        expectedMap1.putString("string", "string1")
        expectedMap1.putMap("map", expectedMap2)

        assertEquals(actual, expectedMap1)
    }
}
