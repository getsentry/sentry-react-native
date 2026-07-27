package io.sentry.react;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class RNSentryAppStartTest {

  @Test
  public void backgroundReasonsAreTreatedAsBackgroundAppStart() {
    final String[] backgroundReasons = {
      "alarm", "backup", "boot_complete", "broadcast", "content_provider", "job", "push", "service"
    };

    for (final String reason : backgroundReasons) {
      assertTrue(
          "Expected reason '" + reason + "' to be treated as a background app start",
          RNSentryModuleImpl.isBackgroundAppStartReason(reason));
    }
  }

  @Test
  public void userLaunchReasonsAreNotTreatedAsBackgroundAppStart() {
    final String[] userLaunchReasons = {"launcher", "launcher_recents", "start_activity", "other"};

    for (final String reason : userLaunchReasons) {
      assertFalse(
          "Expected reason '" + reason + "' to be treated as a user-initiated app start",
          RNSentryModuleImpl.isBackgroundAppStartReason(reason));
    }
  }

  @Test
  public void nullReasonIsNotTreatedAsBackgroundAppStart() {
    // getAppStartReason() returns null on API < 35, where we fall back to the foreground check
    // only.
    assertFalse(RNSentryModuleImpl.isBackgroundAppStartReason(null));
  }

  @Test
  public void unknownReasonIsNotTreatedAsBackgroundAppStart() {
    assertFalse(RNSentryModuleImpl.isBackgroundAppStartReason("some_future_reason"));
  }
}
