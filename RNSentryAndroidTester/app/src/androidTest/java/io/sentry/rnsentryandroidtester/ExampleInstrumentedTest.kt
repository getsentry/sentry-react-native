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

@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {

    @Before
    fun setUp() {
        val context: Context = InstrumentationRegistry.getInstrumentation().targetContext
        SoLoader.init(context, false)
    }

    @Test
    fun converts_map_with_null_key() {
        val actualMap = MapConverter.convertToWritable(hashMapOf("null" to null))
        val expectedMap = Arguments.createMap();
        expectedMap.putNull("null")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_boolean_key() {
        val actualMap = MapConverter.convertToWritable(hashMapOf("boolean" to true))
        val expectedMap = Arguments.createMap();
        expectedMap.putBoolean("boolean", true)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_double_key() {
        val actualMap = MapConverter.convertToWritable(hashMapOf("double" to 1.1))
        val expectedMap = Arguments.createMap();
        expectedMap.putDouble("double", 1.1)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_integer_key() {
        val actualMap = MapConverter.convertToWritable(hashMapOf("integer" to 1))
        val expectedMap = Arguments.createMap();
        expectedMap.putInt("integer", 1)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_string_key() {
        val actualMap = MapConverter.convertToWritable(hashMapOf("string" to "text"))
        val expectedMap = Arguments.createMap();
        expectedMap.putString("string", "text")
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_null_array_key() {
        val map = HashMap<String, Any>()
        val array = arrayOfNulls<Any>(1)
        map["array"] = array

        val actualMap = MapConverter.convertToWritable(map)
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushNull()
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }

    @Test
    fun converts_map_with_string_array_key() {
        val map = HashMap<String, Any>()
        val array = arrayOf("string")
        map["array"] = array

        val actualMap = MapConverter.convertToWritable(map)
        val expectedMap = Arguments.createMap()
        val expectedArray = Arguments.createArray()
        expectedArray.pushString("string")
        expectedMap.putArray("array", expectedArray)
        assertEquals(expectedMap, actualMap)
    }
}