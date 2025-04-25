package io.sentry.react.utils;

import android.app.Activity;
import com.facebook.react.bridge.ReactApplicationContext;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.CurrentActivityHolder;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/** Utility class for React Native Activity related functionality. */
public final class RNSentryActivityUtils {

  private RNSentryActivityUtils() {
    // Prevent instantiation
  }

  public static @Nullable Activity getCurrentActivity(
      final @NotNull ReactApplicationContext reactContext, final @NotNull ILogger logger) {
    final Activity activity = reactContext.getCurrentActivity();
    if (activity != null) {
      return activity;
    }

    logger.log(
        SentryLevel.DEBUG,
        "[RNSentryActivityUtils] Given ReactApplicationContext has no activity attached, using"
            + " CurrentActivityHolder as a fallback.");
    return CurrentActivityHolder.getInstance().getActivity();
  }
}
