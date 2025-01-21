package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

public final class RNSentryJsonUtils {
  private RNSentryJsonUtils() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  public static JSONObject getOptionsFromConfigurationFile(
      Context context, String fileName, ILogger logger) {
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

  public static Map<String, Object> jsonObjectToMap(JSONObject jsonObject) {
    Map<String, Object> map = new HashMap<>();
    Iterator<String> keys = jsonObject.keys();
    while (keys.hasNext()) {
      String key = keys.next();
      Object value = null;
      try {
        value = jsonObject.get(key);
      } catch (JSONException e) {
        throw new RuntimeException(e);
      }
      map.put(key, value);
    }
    return map;
  }

  public static ReadableMap jsonObjectToReadableMap(JSONObject jsonObject) {
    Map<String, Object> map = jsonObjectToMap(jsonObject);
    return (WritableMap) RNSentryMapConverter.convertToJavaWritable(map);
  }
}
