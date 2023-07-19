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
import java.math.BigInteger

class Unknown


@RunWith(AndroidJUnit4::class)
class MapConverterTest {

    @Before
    fun setUp() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        SoLoader.init(context, false)
    }

    @Test
    fun convertsUnknownValueToNull() {
        val actual = MapConverter.convertToWritable(Unknown())
        assertNull(actual)
    }

    @Test
    fun convertsFloatToDouble() {
        val actual = MapConverter.convertToWritable(Float.MAX_VALUE)
        assert(actual is Double)
        assertEquals(Float.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun convertsByteToInt() {
        val actual = MapConverter.convertToWritable(Byte.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Byte.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun convertsShortToInt() {
        val actual = MapConverter.convertToWritable(Short.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Short.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun convertsLongToDouble() {
        val actual = MapConverter.convertToWritable(Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun convertsBigDecimalToDouble() {
        val actual = MapConverter.convertToWritable(BigDecimal.TEN)
        assertEquals(BigDecimal.TEN.toDouble(), actual)
    }

    @Test
    fun convertsBigIntegerToDouble() {
        val actual = MapConverter.convertToWritable(BigInteger.TEN)
        assertEquals(BigInteger.TEN.toDouble(), actual)
    }

    @Test
    fun keepsNull() {
        val actual = MapConverter.convertToWritable(null)
        assertNull(actual)
    }

    @Test
    fun keepsBoolean() {
        val actual = MapConverter.convertToWritable(true)
        assertEquals(true, actual)
    }

    @Test
    fun keepsDouble() {
        val actual = MapConverter.convertToWritable(Double.MAX_VALUE)
        assertEquals(Double.MAX_VALUE, actual)
    }

    @Test
    fun keepsInteger() {
        val actual = MapConverter.convertToWritable(Integer.MAX_VALUE)
        assertEquals(Integer.MAX_VALUE, actual)
    }

    @Test
    fun keepsString() {
        val actual = MapConverter.convertToWritable("string")
        assertEquals("string", actual)
    }

    @Test
    fun convertsMapWithUnknownValueKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("unknown" to Unknown()))
        val expectedMap = Arguments.createMap();
        expectedMap.putNull("unknown")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithNullKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("null" to null))
        val expectedMap = Arguments.createMap();
        expectedMap.putNull("null")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithBooleanKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("boolean" to true))
        val expectedMap = Arguments.createMap();
        expectedMap.putBoolean("boolean", true)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithDoubleKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("double" to Double.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("double", Double.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithIntegerKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("integer" to Integer.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putInt("integer", Integer.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithByteKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("byte" to Byte.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putInt("byte", Byte.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithShortKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("short" to Short.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putInt("short", Short.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithFloatKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("float" to Float.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("float", Float.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithLongKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("long" to Long.MAX_VALUE))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("long", Long.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithInBigDecimalKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("big_decimal" to BigDecimal.TEN))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("big_decimal", BigDecimal.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithBigIntKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("big_int" to BigInteger.TEN))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("big_int", BigInteger.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithStringKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("string" to "string"))
        val expectedMap = Arguments.createMap();
        expectedMap.putString("string", "string")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithListKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("list" to listOf<String>()))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedMap.putArray("list", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsMapWithNestedMapKey() {
        val actualMap = MapConverter.convertToWritable(mapOf("map" to mapOf<String, Any>()))
        val expectedMap = Arguments.createMap()
        val expectedNestedMap = Arguments.createMap()
        expectedMap.putMap("map", expectedNestedMap)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun convertsListOfBoolean() {
        val expected = Arguments.createArray()
        expected.pushBoolean(true)
        assertEquals(expected, MapConverter.convertToWritable(listOf(true)))
    }

    @Test
    fun convertsListOfDouble() {
        val expected = Arguments.createArray()
        expected.pushDouble(Double.MAX_VALUE)
        assertEquals(expected, MapConverter.convertToWritable(listOf(Double.MAX_VALUE)))
    }

    @Test
    fun convertsListOfFloat() {
        val expected = Arguments.createArray()
        expected.pushDouble(Float.MAX_VALUE.toDouble())
        assertEquals(expected, MapConverter.convertToWritable(listOf(Float.MAX_VALUE)))
    }

    @Test
    fun convertsListOfInteger() {
        val expected = Arguments.createArray()
        expected.pushInt(Int.MAX_VALUE)
        assertEquals(expected, MapConverter.convertToWritable(listOf(Int.MAX_VALUE)))
    }

    @Test
    fun convertsListOfShort() {
        val expected = Arguments.createArray()
        expected.pushInt(Short.MAX_VALUE.toInt())
        assertEquals(expected, MapConverter.convertToWritable(listOf(Short.MAX_VALUE)))
    }

    @Test
    fun convertsListOfByte() {
        val expected = Arguments.createArray()
        expected.pushInt(Byte.MAX_VALUE.toInt())
        assertEquals(expected, MapConverter.convertToWritable(listOf(Byte.MAX_VALUE)))
    }

    @Test
    fun convertsListOfLong() {
        val expected = Arguments.createArray()
        expected.pushDouble(Long.MAX_VALUE.toDouble())
        assertEquals(expected, MapConverter.convertToWritable(listOf(Long.MAX_VALUE)))
    }

    @Test
    fun convertsListOfBigInt() {
        val expected = Arguments.createArray()
        expected.pushDouble(BigInteger.TEN.toDouble())
        assertEquals(expected, MapConverter.convertToWritable(listOf(BigInteger.TEN)))
    }

    @Test
    fun convertsListOfBigDecimal() {
        val expected = Arguments.createArray()
        expected.pushDouble(BigDecimal.TEN.toDouble())
        assertEquals(expected, MapConverter.convertToWritable(listOf(BigDecimal.TEN)))
    }

    @Test
    fun convertsListOfString() {
        val expected = Arguments.createArray()
        expected.pushString("string")
        assertEquals(expected, MapConverter.convertToWritable(listOf("string")))
    }

    @Test
    fun convertsListOfMap() {
        val expected = Arguments.createArray()
        val expectedMap = Arguments.createMap()
        expectedMap.putString("map", "string")
        expected.pushMap(expectedMap)
        assertEquals(expected, MapConverter.convertToWritable(listOf(mapOf("map" to "string"))))
    }

    @Test
    fun convertsNestedLists() {
        val actual = MapConverter.convertToWritable(listOf(listOf<String>()))
        val expectedArray = Arguments.createArray()
        val expectedNestedArray = Arguments.createArray()
        expectedArray.pushArray(expectedNestedArray)
        assertEquals(actual, expectedArray)
    }

    @Test
    fun convertsComplexMapCorrectly() {
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
