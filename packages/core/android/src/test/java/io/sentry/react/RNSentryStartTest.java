package io.sentry.react;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.android.core.SentryAndroidOptions;
import org.junit.Test;

/**
 * Coverage for the native option mapping in {@link RNSentryStart#getSentryAndroidOptions} — that RN
 * options forwarded from JS are applied onto {@link SentryAndroidOptions}.
 */
public class RNSentryStartTest {

  private static SentryAndroidOptions optionsFrom(ReadableMap rnOptions) {
    final SentryAndroidOptions options = new SentryAndroidOptions();
    RNSentryStart.getSentryAndroidOptions(options, rnOptions, mock(ILogger.class));
    return options;
  }

  @Test
  public void enableNetworkEventBreadcrumbsForwardsTrue() {
    final ReadableMap rnOptions = mock(ReadableMap.class);
    when(rnOptions.hasKey("enableNetworkEventBreadcrumbs")).thenReturn(true);
    when(rnOptions.getBoolean("enableNetworkEventBreadcrumbs")).thenReturn(true);

    assertTrue(optionsFrom(rnOptions).isEnableNetworkEventBreadcrumbs());
  }

  @Test
  public void enableNetworkEventBreadcrumbsForwardsFalse() {
    final ReadableMap rnOptions = mock(ReadableMap.class);
    when(rnOptions.hasKey("enableNetworkEventBreadcrumbs")).thenReturn(true);
    when(rnOptions.getBoolean("enableNetworkEventBreadcrumbs")).thenReturn(false);

    assertFalse(optionsFrom(rnOptions).isEnableNetworkEventBreadcrumbs());
  }

  @Test
  public void enableNetworkEventBreadcrumbsPreservesNativeDefaultWhenUnset() {
    final ReadableMap rnOptions = mock(ReadableMap.class);

    // Native default is true; omitting the RN option must not change it.
    assertTrue(optionsFrom(rnOptions).isEnableNetworkEventBreadcrumbs());
  }
}
