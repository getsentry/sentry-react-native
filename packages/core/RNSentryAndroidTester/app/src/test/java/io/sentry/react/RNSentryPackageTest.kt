package io.sentry.react

import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.kotlin.mock

@RunWith(JUnit4::class)
class RNSentryPackageTest {
    private val reactContext: ReactApplicationContext = mock()
    private val sentryPackage = RNSentryPackage()

    @Test
    fun `getViewManagerNames matches the eagerly created view managers`() {
        val eagerNames = sentryPackage.createViewManagers(reactContext).map { it.name }.toSet()

        assertEquals(eagerNames, sentryPackage.getViewManagerNames(reactContext).toSet())
    }

    @Test
    fun `createViewManager creates the view manager with the requested name`() {
        for (name in sentryPackage.getViewManagerNames(reactContext)) {
            val viewManager = sentryPackage.createViewManager(reactContext, name)

            assertNotNull("No view manager for $name", viewManager)
            assertEquals(name, viewManager?.name)
        }
    }

    @Test
    fun `createViewManager returns null for an unknown name`() {
        assertNull(sentryPackage.createViewManager(reactContext, "UnknownViewManager"))
    }
}
