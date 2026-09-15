package io.sentry.react;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.SentryReplayOptions;
import org.junit.Test;

/**
 * Coverage for the per-class Session Replay masking wiring in {@link
 * RNSentryStart#getReplayOptions} ({@code maskedViewClasses} / {@code unmaskedViewClasses}
 * forwarded from {@code mobileReplayOptions} into {@link SentryReplayOptions#addMaskViewClass} /
 * {@link SentryReplayOptions#addUnmaskViewClass}).
 */
public class RNSentryReplayOptionsTest {

  private static final String MASKED_CLASS = "com.example.MaskedView";
  private static final String UNMASKED_CLASS = "com.example.UnmaskedView";

  private static ReadableArray singletonArray(String value) {
    final ReadableArray array = mock(ReadableArray.class);
    when(array.size()).thenReturn(1);
    when(array.getString(0)).thenReturn(value);
    return array;
  }

  private static ReadableMap rnOptionsWith(ReadableMap mobileReplayOptions) {
    final ReadableMap rnOptions = mock(ReadableMap.class);
    when(rnOptions.hasKey("replaysOnErrorSampleRate")).thenReturn(true);
    when(rnOptions.getDouble("replaysOnErrorSampleRate")).thenReturn(0.75);
    when(rnOptions.hasKey("mobileReplayOptions")).thenReturn(true);
    when(rnOptions.getMap("mobileReplayOptions")).thenReturn(mobileReplayOptions);
    return rnOptions;
  }

  @Test
  public void addsUserMaskedViewClasses() {
    final ReadableArray maskedClasses = singletonArray(MASKED_CLASS);
    final ReadableMap mobileReplayOptions = mock(ReadableMap.class);
    when(mobileReplayOptions.hasKey("maskedViewClasses")).thenReturn(true);
    when(mobileReplayOptions.getArray("maskedViewClasses")).thenReturn(maskedClasses);

    final SentryReplayOptions replayOptions =
        RNSentryStart.getReplayOptions(rnOptionsWith(mobileReplayOptions));

    assertTrue(replayOptions.getMaskViewClasses().contains(MASKED_CLASS));
  }

  @Test
  public void addsUserUnmaskedViewClasses() {
    final ReadableArray unmaskedClasses = singletonArray(UNMASKED_CLASS);
    final ReadableMap mobileReplayOptions = mock(ReadableMap.class);
    when(mobileReplayOptions.hasKey("unmaskedViewClasses")).thenReturn(true);
    when(mobileReplayOptions.getArray("unmaskedViewClasses")).thenReturn(unmaskedClasses);

    final SentryReplayOptions replayOptions =
        RNSentryStart.getReplayOptions(rnOptionsWith(mobileReplayOptions));

    assertTrue(replayOptions.getUnmaskViewClasses().contains(UNMASKED_CLASS));
  }

  @Test
  public void doesNotAddUserClassesWhenNotProvided() {
    final ReadableMap mobileReplayOptions = mock(ReadableMap.class);

    final SentryReplayOptions replayOptions =
        RNSentryStart.getReplayOptions(rnOptionsWith(mobileReplayOptions));

    assertFalse(replayOptions.getMaskViewClasses().contains(MASKED_CLASS));
    assertFalse(replayOptions.getUnmaskViewClasses().contains(UNMASKED_CLASS));
  }
}
