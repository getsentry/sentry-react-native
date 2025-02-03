package io.sentry.react

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.facebook.react.bridge.PromiseImpl
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.soloader.SoLoader
import io.sentry.Breadcrumb
import io.sentry.Scope
import io.sentry.SentryOptions
import io.sentry.android.core.SentryAndroidOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class RNSentryModuleImplTest {
    private lateinit var module: RNSentryModuleImpl
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = InstrumentationRegistry.getInstrumentation().targetContext
        SoLoader.init(context, false)
        val reactContext = ReactApplicationContext(context)
        module = RNSentryModuleImpl(reactContext)
    }

    @Test
    fun fetchNativeDeviceContextsWithNullContext() {
        val options = SentryAndroidOptions()
        val scope = Scope(options)
        val promise =
            PromiseImpl({
                assertEquals(1, it.size)
                assertEquals(null, it[0])
            }, {
                fail("Promise was rejected unexpectedly")
            })
        module.fetchNativeDeviceContexts(promise, options, null, scope)
    }

    @Test
    fun fetchNativeDeviceContextsWithInvalidSentryOptions() {
        class NotAndroidSentryOptions : SentryOptions()

        val options = NotAndroidSentryOptions()
        val scope = Scope(options)
        val promise =
            PromiseImpl({
                assertEquals(1, it.size)
                assertEquals(null, it[0])
            }, {
                fail("Promise was rejected unexpectedly")
            })
        module.fetchNativeDeviceContexts(promise, options, context, scope)
    }

    @Test
    fun fetchNativeDeviceContextsFiltersBreadcrumbs() {
        val options = SentryAndroidOptions().apply { maxBreadcrumbs = 5 }
        val scope = Scope(options)
        scope.addBreadcrumb(Breadcrumb("Breadcrumb1-RN").apply { origin = "react-native" })
        scope.addBreadcrumb(Breadcrumb("Breadcrumb2-Native"))
        scope.addBreadcrumb(Breadcrumb("Breadcrumb3-Native").apply { origin = "java" })
        scope.addBreadcrumb(Breadcrumb("Breadcrumb2-RN").apply { origin = "react-native" })
        scope.addBreadcrumb(Breadcrumb("Breadcrumb2-RN").apply { origin = "react-native" })

        val promise =
            PromiseImpl({
                assertEquals(1, it.size)
                assertEquals(true, it[0] is WritableMap)
                val actual = it[0] as WritableMap
                val breadcrumbs = actual.getArray("breadcrumbs")
                assertEquals(2, breadcrumbs?.size())
                assertEquals("Breadcrumb2-Native", breadcrumbs?.getMap(0)?.getString("message"))
                assertEquals("Breadcrumb3-Native", breadcrumbs?.getMap(1)?.getString("message"))
            }, {
                fail("Promise was rejected unexpectedly")
            })

        module.fetchNativeDeviceContexts(promise, options, context, scope)
    }
}
