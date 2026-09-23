package io.sentry.react;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.android.core.SentryAndroidOptions;
import java.util.function.Predicate;
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

  /**
   * Asserts the on-by-default breadcrumb off-switch {@code key} forwards both values onto {@code
   * getter} and preserves the native default (true) when omitted.
   */
  private static void assertBreadcrumbOffSwitchForwarded(
      String key, Predicate<SentryAndroidOptions> getter) {
    final ReadableMap forwardsFalse = mock(ReadableMap.class);
    when(forwardsFalse.hasKey(key)).thenReturn(true);
    when(forwardsFalse.getBoolean(key)).thenReturn(false);
    assertFalse(getter.test(optionsFrom(forwardsFalse)));

    final ReadableMap forwardsTrue = mock(ReadableMap.class);
    when(forwardsTrue.hasKey(key)).thenReturn(true);
    when(forwardsTrue.getBoolean(key)).thenReturn(true);
    assertTrue(getter.test(optionsFrom(forwardsTrue)));

    // Native default is true; omitting the RN option must not change it.
    assertTrue(getter.test(optionsFrom(mock(ReadableMap.class))));
  }

  @Test
  public void enableActivityLifecycleBreadcrumbsForwarded() {
    assertBreadcrumbOffSwitchForwarded(
        "enableActivityLifecycleBreadcrumbs",
        SentryAndroidOptions::isEnableActivityLifecycleBreadcrumbs);
  }

  @Test
  public void enableAppLifecycleBreadcrumbsForwarded() {
    assertBreadcrumbOffSwitchForwarded(
        "enableAppLifecycleBreadcrumbs", SentryAndroidOptions::isEnableAppLifecycleBreadcrumbs);
  }

  @Test
  public void enableSystemEventBreadcrumbsForwarded() {
    assertBreadcrumbOffSwitchForwarded(
        "enableSystemEventBreadcrumbs", SentryAndroidOptions::isEnableSystemEventBreadcrumbs);
  }

  @Test
  public void enableAppComponentBreadcrumbsForwarded() {
    assertBreadcrumbOffSwitchForwarded(
        "enableAppComponentBreadcrumbs", SentryAndroidOptions::isEnableAppComponentBreadcrumbs);
  }
}
