package io.sentry.react;

import android.content.Context;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONObject;

final class RNSentryJsonUtils {
  private RNSentryJsonUtils() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  static @Nullable JSONObject getOptionsFromConfigurationFile(
      @NotNull Context context, @NotNull String fileName, @NotNull ILogger logger) {
    try (InputStream inputStream = context.getAssets().open(fileName);
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
              + fileName
              + " exists in the root of your project.",
          e);
      return null;
    }
  }
}
