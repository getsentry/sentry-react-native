package io.sentry.react.replay

import com.facebook.react.module.annotations.ReactModule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.MockitoAnnotations

@RunWith(JUnit4::class)
class RNSentryReplayMaskManagerTest {
    private val expectedName = RNSentryReplayMaskManagerImpl.REACT_CLASS

    private lateinit var manager: RNSentryReplayMaskManager

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        manager = RNSentryReplayMaskManager()
    }

    @Test
    fun `getName returns correct react class name`() {
        assertEquals(expectedName, manager.getName())
    }

    @Test
    fun `module annotation name matches getName result`() {
        val annotation = manager.javaClass.getAnnotation(ReactModule::class.java)
        assertNotNull("ReactModule annotation should be present", annotation)
        assertEquals(
            "Annotation name should match getName() result",
            expectedName,
            annotation?.name,
        )
    }
}
