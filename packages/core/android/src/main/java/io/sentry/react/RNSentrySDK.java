package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.json.JSONObject;

public final class RNSentrySDK {
  private static final String CONFIGURATION_FILE = "sentry.options.json";
  private static final String NAME = "RNSentrySDK";

  private static final ILogger logger = new AndroidLogger(NAME);

  private RNSentrySDK() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  private static void startWithOptions(
      @NotNull final Context context, @NotNull final ReadableMap rnOptions) {
    RNSentryStart.startWithOptions(context, rnOptions, null, logger);
  }

  /**
   * Start the Native Android SDK with the provided options
   *
   * @param context Android Context
   * @param options Map with options
   */
  public static void startWithOptions(
      @NotNull final Context context, @NotNull final Map<String, Object> options) {
    ReadableMap rnOptions = RNSentryMapConverter.mapToReadableMap(options);
    startWithOptions(context, rnOptions);
  }

  /**
   * Start the Native Android SDK with options from `sentry.options.json` configuration file
   *
   * @param context Android Context
   */
  public static void start(@NotNull final Context context) {
    try {
      JSONObject jsonObject = getOptionsFromConfigurationFile(context);
      ReadableMap rnOptions = RNSentryMapConverter.jsonObjectToReadableMap(jsonObject);
      startWithOptions(context, rnOptions);
    } catch (Exception e) {
      logger.log(
          SentryLevel.ERROR, "Failed to start Sentry with options from configuration file.", e);
      throw new RuntimeException(e);
    }
  }

  private static JSONObject getOptionsFromConfigurationFile(Context context) {
    try (InputStream inputStream = context.getAssets().open(CONFIGURATION_FILE);
        BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {

      StringBuilder stringBuilder = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        stringBuilder.append(line);
      }
      String configFileContent = stringBuilder.toString();
      return new JSONObject(configFileContent);

    } catch (Exception e) {
      logger.log(
          SentryLevel.ERROR,
          "Failed to read configuration file. Please make sure "
              + CONFIGURATION_FILE
              + " exists in the root of your project.",
          e);
      return null;
    }
  }
}
