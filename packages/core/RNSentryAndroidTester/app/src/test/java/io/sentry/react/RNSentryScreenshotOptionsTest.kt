package io.sentry.react

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import io.sentry.SentryMaskingOptions
import io.sentry.android.core.SentryScreenshotOptions
import io.sentry.react.replay.RNSentryReplayMask
import io.sentry.react.replay.RNSentryReplayUnmask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class RNSentryScreenshotOptionsTest {
    @Test
    fun `masks text, images and svgs by default when no screenshot options are passed`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(screenshot, null, true)

        assertTrue(screenshot.maskViewClasses.contains(SentryMaskingOptions.TEXT_VIEW_CLASS_NAME))
        assertTrue(screenshot.maskViewClasses.contains(SentryMaskingOptions.IMAGE_VIEW_CLASS_NAME))
        assertTrue(screenshot.maskViewClasses.contains("com.horcrux.svg.SvgView"))
    }

    @Test
    fun `masks text, images and svgs by default when the masking keys are missing`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(screenshot, JavaOnlyMap.of(), true)

        assertTrue(screenshot.maskViewClasses.contains(SentryMaskingOptions.TEXT_VIEW_CLASS_NAME))
        assertTrue(screenshot.maskViewClasses.contains(SentryMaskingOptions.IMAGE_VIEW_CLASS_NAME))
        assertTrue(screenshot.maskViewClasses.contains("com.horcrux.svg.SvgView"))
    }

    @Test
    fun `masks only Sentry Mask content when masking is disabled`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(
            screenshot,
            JavaOnlyMap.of("maskAllText", false, "maskAllImages", false),
            true,
        )

        // Only <Sentry.Mask> content stays masked
        assertEquals(setOf(RNSentryReplayMask::class.java.name), screenshot.maskViewClasses)
    }

    @Test
    fun `does not mask anything when masking is disabled and replay is not available`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(
            screenshot,
            JavaOnlyMap.of("maskAllText", false, "maskAllImages", false),
            false,
        )

        assertEquals(emptySet<String>(), screenshot.maskViewClasses)
        assertNull(screenshot.maskViewContainerClass)
    }

    @Test
    fun `masks only text when images are unmasked`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(
            screenshot,
            JavaOnlyMap.of("maskAllText", true, "maskAllImages", false),
            true,
        )

        assertTrue(screenshot.maskViewClasses.contains(SentryMaskingOptions.TEXT_VIEW_CLASS_NAME))
        assertFalse(screenshot.maskViewClasses.contains(SentryMaskingOptions.IMAGE_VIEW_CLASS_NAME))
        assertFalse(screenshot.maskViewClasses.contains("com.horcrux.svg.SvgView"))
    }

    @Test
    fun `adds custom masked and unmasked view classes`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(
            screenshot,
            JavaOnlyMap.of(
                "maskedViewClasses",
                JavaOnlyArray.of("com.example.Secret"),
                "unmaskedViewClasses",
                JavaOnlyArray.of("com.example.Public"),
            ),
            true,
        )

        assertTrue(screenshot.maskViewClasses.contains("com.example.Secret"))
        assertTrue(screenshot.unmaskViewClasses.contains("com.example.Public"))
    }

    @Test
    fun `sets the Mask and Unmask container classes`() {
        val screenshot = SentryScreenshotOptions()

        RNSentryStart.configureScreenshotMasking(screenshot, null, true)

        assertEquals(RNSentryReplayMask::class.java.name, screenshot.maskViewContainerClass)
        assertEquals(RNSentryReplayUnmask::class.java.name, screenshot.unmaskViewContainerClass)
    }
}
