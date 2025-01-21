package io.sentry.rnsentryandroidtester

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.soloader.SoLoader
import io.sentry.react.RNSentryMapConverter
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
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
    fun nativeConvertsUnknownValueToNull() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Unknown())
        assertNull(actual)
    }

    @Test
    fun nativeConvertsFloatToDouble() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Float.MAX_VALUE)
        assert(actual is Double)
        assertEquals(Float.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun nativeConvertsByteToInt() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Byte.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Byte.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun nativeConvertsShortToInt() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Short.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Short.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun nativeConvertsLongToDouble() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun nativeConvertsBigDecimalToDouble() {
        val actual = RNSentryMapConverter.convertToNativeWritable(BigDecimal.TEN)
        assertEquals(BigDecimal.TEN.toDouble(), actual)
    }

    @Test
    fun nativeConvertsBigIntegerToDouble() {
        val actual = RNSentryMapConverter.convertToNativeWritable(BigInteger.TEN)
        assertEquals(BigInteger.TEN.toDouble(), actual)
    }

    @Test
    fun nativeKeepsNull() {
        val actual = RNSentryMapConverter.convertToNativeWritable(null)
        assertNull(actual)
    }

    @Test
    fun nativeKeepsBoolean() {
        val actual = RNSentryMapConverter.convertToNativeWritable(true)
        assertEquals(true, actual)
    }

    @Test
    fun nativeKeepsDouble() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Double.MAX_VALUE)
        assertEquals(Double.MAX_VALUE, actual)
    }

    @Test
    fun nativeKeepsInteger() {
        val actual = RNSentryMapConverter.convertToNativeWritable(Integer.MAX_VALUE)
        assertEquals(Integer.MAX_VALUE, actual)
    }

    @Test
    fun nativeKeepsString() {
        val actual = RNSentryMapConverter.convertToNativeWritable("string")
        assertEquals("string", actual)
    }

    @Test
    fun nativeConvertsMapWithUnknownValueKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("unknown" to Unknown()))
        val expectedMap = Arguments.createMap()
        expectedMap.putNull("unknown")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithNullKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("null" to null))
        val expectedMap = Arguments.createMap()
        expectedMap.putNull("null")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithBooleanKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("boolean" to true))
        val expectedMap = Arguments.createMap()
        expectedMap.putBoolean("boolean", true)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithDoubleKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("double" to Double.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putDouble("double", Double.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithIntegerKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("integer" to Integer.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putInt("integer", Integer.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithByteKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("byte" to Byte.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putInt("byte", Byte.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithShortKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("short" to Short.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putInt("short", Short.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithFloatKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("float" to Float.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putDouble("float", Float.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithLongKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("long" to Long.MAX_VALUE))
        val expectedMap = Arguments.createMap()
        expectedMap.putDouble("long", Long.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithInBigDecimalKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("big_decimal" to BigDecimal.TEN))
        val expectedMap = Arguments.createMap()
        expectedMap.putDouble("big_decimal", BigDecimal.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithBigIntKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("big_int" to BigInteger.TEN))
        val expectedMap = Arguments.createMap()
        expectedMap.putDouble("big_int", BigInteger.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithStringKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("string" to "string"))
        val expectedMap = Arguments.createMap()
        expectedMap.putString("string", "string")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithListKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("list" to listOf<String>()))
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedMap.putArray("list", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsMapWithNestedMapKey() {
        val actualMap = RNSentryMapConverter.convertToNativeWritable(mapOf("map" to mapOf<String, Any>()))
        val expectedMap = Arguments.createMap()
        val expectedNestedMap = Arguments.createMap()
        expectedMap.putMap("map", expectedNestedMap)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun nativeConvertsListOfBoolean() {
        val expected = Arguments.createArray()
        expected.pushBoolean(true)
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(true)))
    }

    @Test
    fun nativeConvertsListOfDouble() {
        val expected = Arguments.createArray()
        expected.pushDouble(Double.MAX_VALUE)
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Double.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfFloat() {
        val expected = Arguments.createArray()
        expected.pushDouble(Float.MAX_VALUE.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Float.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfInteger() {
        val expected = Arguments.createArray()
        expected.pushInt(Int.MAX_VALUE)
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Int.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfShort() {
        val expected = Arguments.createArray()
        expected.pushInt(Short.MAX_VALUE.toInt())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Short.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfByte() {
        val expected = Arguments.createArray()
        expected.pushInt(Byte.MAX_VALUE.toInt())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Byte.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfLong() {
        val expected = Arguments.createArray()
        expected.pushDouble(Long.MAX_VALUE.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(Long.MAX_VALUE)))
    }

    @Test
    fun nativeConvertsListOfBigInt() {
        val expected = Arguments.createArray()
        expected.pushDouble(BigInteger.TEN.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(BigInteger.TEN)))
    }

    @Test
    fun nativeConvertsListOfBigDecimal() {
        val expected = Arguments.createArray()
        expected.pushDouble(BigDecimal.TEN.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(BigDecimal.TEN)))
    }

    @Test
    fun nativeConvertsListOfString() {
        val expected = Arguments.createArray()
        expected.pushString("string")
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf("string")))
    }

    @Test
    fun nativeConvertsListOfMap() {
        val expected = Arguments.createArray()
        val expectedMap = Arguments.createMap()
        expectedMap.putString("map", "string")
        expected.pushMap(expectedMap)
        assertEquals(expected, RNSentryMapConverter.convertToNativeWritable(listOf(mapOf("map" to "string"))))
    }

    @Test
    fun nativeConvertsNestedLists() {
        val actual = RNSentryMapConverter.convertToNativeWritable(listOf(listOf<String>()))
        val expectedArray = Arguments.createArray()
        val expectedNestedArray = Arguments.createArray()
        expectedArray.pushArray(expectedNestedArray)
        assertEquals(actual, expectedArray)
    }

    @Test
    fun nativeConvertsComplexMapCorrectly() {
        val actual =
            RNSentryMapConverter.convertToNativeWritable(
                mapOf(
                    "integer" to Integer.MAX_VALUE,
                    "string" to "string1",
                    "map" to
                        mapOf(
                            "integer" to Integer.MAX_VALUE,
                            "string" to "string2",
                            "map" to
                                mapOf(
                                    "integer" to Integer.MAX_VALUE,
                                    "string" to "string3",
                                ),
                        ),
                    "list" to
                        listOf(
                            Integer.MAX_VALUE,
                            mapOf(
                                "integer" to Integer.MAX_VALUE,
                                "string" to "string4",
                            ),
                            "string5",
                        ),
                ),
            )

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

    @Test
    fun javaConvertsUnknownValueToNull() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Unknown())
        assertNull(actual)
    }

    @Test
    fun javaConvertsFloatToDouble() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Float.MAX_VALUE)
        assert(actual is Double)
        assertEquals(Float.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun javaConvertsByteToInt() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Byte.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Byte.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun javaConvertsShortToInt() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Short.MAX_VALUE)
        assert(actual is Int)
        assertEquals(Short.MAX_VALUE.toInt(), actual)
    }

    @Test
    fun javaConvertsLongToDouble() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE.toDouble(), actual)
    }

    @Test
    fun javaConvertsBigDecimalToDouble() {
        val actual = RNSentryMapConverter.convertToJavaWritable(BigDecimal.TEN)
        assertEquals(BigDecimal.TEN.toDouble(), actual)
    }

    @Test
    fun javaConvertsBigIntegerToDouble() {
        val actual = RNSentryMapConverter.convertToJavaWritable(BigInteger.TEN)
        assertEquals(BigInteger.TEN.toDouble(), actual)
    }

    @Test
    fun javaKeepsNull() {
        val actual = RNSentryMapConverter.convertToJavaWritable(null)
        assertNull(actual)
    }

    @Test
    fun javaKeepsBoolean() {
        val actual = RNSentryMapConverter.convertToJavaWritable(true)
        assertEquals(true, actual)
    }

    @Test
    fun javaKeepsDouble() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Double.MAX_VALUE)
        assertEquals(Double.MAX_VALUE, actual)
    }

    @Test
    fun javaKeepsInteger() {
        val actual = RNSentryMapConverter.convertToJavaWritable(Integer.MAX_VALUE)
        assertEquals(Integer.MAX_VALUE, actual)
    }

    @Test
    fun javaKeepsString() {
        val actual = RNSentryMapConverter.convertToJavaWritable("string")
        assertEquals("string", actual)
    }

    @Test
    fun javaConvertsMapWithUnknownValueKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("unknown" to Unknown()))
        val expectedMap = JavaOnlyMap()
        expectedMap.putNull("unknown")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithNullKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("null" to null))
        val expectedMap = JavaOnlyMap()
        expectedMap.putNull("null")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithBooleanKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("boolean" to true))
        val expectedMap = JavaOnlyMap()
        expectedMap.putBoolean("boolean", true)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithDoubleKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("double" to Double.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putDouble("double", Double.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithIntegerKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("integer" to Integer.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putInt("integer", Integer.MAX_VALUE)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithByteKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("byte" to Byte.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putInt("byte", Byte.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithShortKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("short" to Short.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putInt("short", Short.MAX_VALUE.toInt())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithFloatKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("float" to Float.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putDouble("float", Float.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithLongKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("long" to Long.MAX_VALUE))
        val expectedMap = JavaOnlyMap()
        expectedMap.putDouble("long", Long.MAX_VALUE.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithInBigDecimalKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("big_decimal" to BigDecimal.TEN))
        val expectedMap = JavaOnlyMap()
        expectedMap.putDouble("big_decimal", BigDecimal.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithBigIntKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("big_int" to BigInteger.TEN))
        val expectedMap = JavaOnlyMap()
        expectedMap.putDouble("big_int", BigInteger.TEN.toDouble())
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithStringKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("string" to "string"))
        val expectedMap = JavaOnlyMap()
        expectedMap.putString("string", "string")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithListKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("list" to listOf<String>()))
        val expectedMap = JavaOnlyMap()
        val expectedArray = JavaOnlyArray()
        expectedMap.putArray("list", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsMapWithNestedMapKey() {
        val actualMap = RNSentryMapConverter.convertToJavaWritable(mapOf("map" to mapOf<String, Any>()))
        val expectedMap = JavaOnlyMap()
        val expectedNestedMap = JavaOnlyMap()
        expectedMap.putMap("map", expectedNestedMap)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun javaConvertsListOfBoolean() {
        val expected = JavaOnlyArray()
        expected.pushBoolean(true)
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(true)))
    }

    @Test
    fun javaConvertsListOfDouble() {
        val expected = JavaOnlyArray()
        expected.pushDouble(Double.MAX_VALUE)
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Double.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfFloat() {
        val expected = JavaOnlyArray()
        expected.pushDouble(Float.MAX_VALUE.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Float.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfInteger() {
        val expected = JavaOnlyArray()
        expected.pushInt(Int.MAX_VALUE)
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Int.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfShort() {
        val expected = JavaOnlyArray()
        expected.pushInt(Short.MAX_VALUE.toInt())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Short.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfByte() {
        val expected = JavaOnlyArray()
        expected.pushInt(Byte.MAX_VALUE.toInt())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Byte.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfLong() {
        val expected = JavaOnlyArray()
        expected.pushDouble(Long.MAX_VALUE.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(Long.MAX_VALUE)))
    }

    @Test
    fun javaConvertsListOfBigInt() {
        val expected = JavaOnlyArray()
        expected.pushDouble(BigInteger.TEN.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(BigInteger.TEN)))
    }

    @Test
    fun javaConvertsListOfBigDecimal() {
        val expected = JavaOnlyArray()
        expected.pushDouble(BigDecimal.TEN.toDouble())
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(BigDecimal.TEN)))
    }

    @Test
    fun javaConvertsListOfString() {
        val expected = JavaOnlyArray()
        expected.pushString("string")
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf("string")))
    }

    @Test
    fun javaConvertsListOfMap() {
        val expected = JavaOnlyArray()
        val expectedMap = JavaOnlyMap()
        expectedMap.putString("map", "string")
        expected.pushMap(expectedMap)
        assertEquals(expected, RNSentryMapConverter.convertToJavaWritable(listOf(mapOf("map" to "string"))))
    }

    @Test
    fun javaConvertsNestedLists() {
        val actual = RNSentryMapConverter.convertToJavaWritable(listOf(listOf<String>()))
        val expectedArray = JavaOnlyArray()
        val expectedNestedArray = JavaOnlyArray()
        expectedArray.pushArray(expectedNestedArray)
        assertEquals(actual, expectedArray)
    }

    @Test
    fun javaConvertsComplexMapCorrectly() {
        val actual =
            RNSentryMapConverter.convertToJavaWritable(
                mapOf(
                    "integer" to Integer.MAX_VALUE,
                    "string" to "string1",
                    "map" to
                        mapOf(
                            "integer" to Integer.MAX_VALUE,
                            "string" to "string2",
                            "map" to
                                mapOf(
                                    "integer" to Integer.MAX_VALUE,
                                    "string" to "string3",
                                ),
                        ),
                    "list" to
                        listOf(
                            Integer.MAX_VALUE,
                            mapOf(
                                "integer" to Integer.MAX_VALUE,
                                "string" to "string4",
                            ),
                            "string5",
                        ),
                ),
            )

        val expectedMap1 = JavaOnlyMap()
        val expectedMap2 = JavaOnlyMap()
        val expectedMap3 = JavaOnlyMap()
        val expectedMap4 = JavaOnlyMap()
        val expectedArray = JavaOnlyArray()

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

    @Test
    fun testJsonObjectToReadableMap() {
        val json =
            JSONObject().apply {
                put("stringKey", "stringValue")
                put("booleanKey", true)
                put("intKey", 123)
            }

        val result = RNSentryMapConverter.jsonObjectToReadableMap(json)

        assertNotNull(result)
        assertTrue(result is JavaOnlyMap)
        assertEquals("stringValue", result.getString("stringKey"))
        assertEquals(true, result.getBoolean("booleanKey"))
        assertEquals(123, result.getInt("intKey"))
    }
}
