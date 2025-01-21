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
   */
  public static void init(
      @NotNull final Context context,
      @NotNull Sentry.OptionsConfiguration<SentryAndroidOptions> configuration) {
    try {
      JSONObject jsonObject =
          RNSentryJsonUtils.getOptionsFromConfigurationFile(context, CONFIGURATION_FILE, logger);
      ReadableMap rnOptions = RNSentryJsonUtils.jsonObjectToReadableMap(jsonObject);
      RNSentryStart.startWithOptions(context, rnOptions, configuration, null, logger);
    } catch (Exception e) {
      logger.log(
          SentryLevel.ERROR, "Failed to start Sentry with options from configuration file.", e);
      throw new RuntimeException(e);
    }
  }

  /**
   * Start the Native Android SDK with options from `sentry.options.json` configuration file
   *
   * @param context Android Context
   */
  public static void init(@NotNull final Context context) {
    init(context, options -> {});
  }
}
