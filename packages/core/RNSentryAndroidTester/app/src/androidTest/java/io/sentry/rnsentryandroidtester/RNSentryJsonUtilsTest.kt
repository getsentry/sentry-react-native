package io.sentry.rnsentryandroidtester

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.soloader.SoLoader
import io.sentry.react.RNSentryJsonUtils
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
        assertEquals("stringValue", result.getString("stringKey"))
        assertEquals(true, result.getBoolean("booleanKey"))
        assertEquals(123, result.getInt("intKey"))
    }
}
