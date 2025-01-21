package io.sentry.react;

import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class RNSentryJsonUtils {
  private RNSentryJsonUtils() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  /**
   * Read the configuration file in the Android assets folder and return the options as a
   * JSONObject.
   *
   * @param context Android Context
   * @param fileName configuration file name
   * @param logger Sentry logger
   * @return JSONObject with the configuration options
   */
  public static @Nullable JSONObject getOptionsFromConfigurationFile(
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

  private static @NotNull Map<String, Object> jsonObjectToMap(@NotNull JSONObject jsonObject) {
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
      map.put(key, convertValue(value));
    }
    return map;
  }

  private static @NotNull List<Object> jsonArrayToList(@NotNull JSONArray jsonArray) {
    List<Object> list = new ArrayList<>();

    for (int i = 0; i < jsonArray.length(); i++) {
      Object value = jsonArray.opt(i);
      list.add(convertValue(value));
    }

    return list;
  }

  private static @Nullable Object convertValue(@Nullable Object value) {
    if (value instanceof JSONObject) {
      return jsonObjectToMap((JSONObject) value);
    } else if (value instanceof JSONArray) {
      return jsonArrayToList((JSONArray) value);
    } else {
      return value; // Primitive type or null
    }
  }

  /**
   * Convert a JSONObject to a ReadableMap
   *
   * @param jsonObject JSONObject to convert
   * @return ReadableMap with the same data as the JSONObject
   */
  public static @Nullable ReadableMap jsonObjectToReadableMap(@Nullable JSONObject jsonObject) {
    if (jsonObject == null) {
      return null;
    }
    Map<String, Object> map = jsonObjectToMap(jsonObject);
    return (WritableMap) RNSentryMapConverter.convertToJavaWritable(map);
  }
}
