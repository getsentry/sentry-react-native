package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.Sentry;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.SentryAndroidOptions;
import org.jetbrains.annotations.NotNull;
import org.json.JSONObject;

public final class RNSentrySDK {
  private static final String CONFIGURATION_FILE = "sentry.options.json";
  private static final String NAME = "RNSentrySDK";

  private static final ILogger logger = new AndroidLogger(NAME);

  private RNSentrySDK() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  /**
   * Start the Native Android SDK with the provided options
   *
   * @param context Android Context
   * @param configuration configuration options
   * @param logger logger
   */
  public static void init(
      @NotNull final Context context,
      @NotNull Sentry.OptionsConfiguration<SentryAndroidOptions> configuration,
      @NotNull ILogger logger) {
    try {
      JSONObject jsonObject =
          RNSentryJsonUtils.getOptionsFromConfigurationFile(context, CONFIGURATION_FILE, logger);
      ReadableMap rnOptions = RNSentryJsonUtils.jsonObjectToReadableMap(jsonObject);
      if (rnOptions == null) {
        logger.log(
            SentryLevel.WARNING,
            "Failed to load configuration file("
                + CONFIGURATION_FILE
                + "), starting with configuration callback.");
        RNSentryStart.startWithConfiguration(context, configuration);
        return;
      }
      RNSentryStart.startWithOptions(context, rnOptions, configuration, null, logger);
    } catch (Exception e) {
      logger.log(
          SentryLevel.ERROR, "Failed to start Sentry with options from configuration file.", e);
      throw new RuntimeException("Failed to initialize Sentry's React Native SDK", e);
    }
  }

  /**
   * Start the Native Android SDK with the provided options
   *
   * @param context Android Context
   * @param configuration configuration options
   */
  public static void init(
      @NotNull final Context context,
      @NotNull Sentry.OptionsConfiguration<SentryAndroidOptions> configuration) {
    init(context, configuration, logger);
  }

  /**
   * Start the Native Android SDK with options from `sentry.options.json` configuration file
   *
   * @param context Android Context
   */
  public static void init(@NotNull final Context context) {
    init(context, options -> {}, logger);
  }
}
