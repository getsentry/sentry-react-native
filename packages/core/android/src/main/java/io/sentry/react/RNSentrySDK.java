package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.Sentry;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.SentryAndroidOptions;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONObject;

public final class RNSentrySDK {
  private static final String CONFIGURATION_FILE = "sentry.options.json";
  private static final String NAME = "RNSentrySDK";

  private static final ILogger logger = new AndroidLogger(NAME);

  private RNSentrySDK() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  /** Passing a custom SDK initializer is intended for internal testing use only. */
  interface SdkInit {
    void init(Context context, Sentry.OptionsConfiguration<SentryAndroidOptions> config);
  }

  static void init(
      @NotNull final Context context,
      @NotNull Sentry.OptionsConfiguration<SentryAndroidOptions> configuration,
      @NotNull String configurationFile,
      @NotNull ILogger logger,
      @Nullable SdkInit sdkInit) {
    try {
      JSONObject jsonObject =
          RNSentryJsonUtils.getOptionsFromConfigurationFile(context, configurationFile, logger);
      if (jsonObject == null) {
        RNSentryStart.startWithConfiguration(context, configuration, sdkInit);
        return;
      }
      ReadableMap rnOptions = RNSentryJsonConverter.convertToWritable(jsonObject);
      if (rnOptions == null) {
        RNSentryStart.startWithConfiguration(context, configuration, sdkInit);
        return;
      }
      RNSentryStart.startWithOptions(context, rnOptions, configuration, logger, sdkInit);
    } catch (Exception e) {
      logger.log(
          SentryLevel.ERROR, "Failed to start Sentry with options from configuration file.", e);
      throw new RuntimeException("Failed to initialize Sentry's React Native SDK", e);
    }
  }

  /**
   * @experimental Start the Native Android SDK with the provided configuration options. Uses as a
   *     base configurations the `sentry.options.json` configuration file if it exists.
   * @param context Android Context
   * @param configuration configuration options
   */
  public static void init(
      @NotNull final Context context,
      @NotNull Sentry.OptionsConfiguration<SentryAndroidOptions> configuration) {
    init(context, configuration, CONFIGURATION_FILE, logger, null);
  }

  /**
   * @experimental Start the Native Android SDK with options from `sentry.options.json`
   *     configuration file.
   * @param context Android Context
   */
  public static void init(@NotNull final Context context) {
    init(context, options -> {}, CONFIGURATION_FILE, logger, null);
  }
}
