package io.sentry.react;

import com.facebook.react.bridge.JavaOnlyArray;
import com.facebook.react.bridge.JavaOnlyMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import java.util.Iterator;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RNSentryJsonConverter {
  public static final String NAME = "RNSentry.RNSentryJsonConverter";

  private static final ILogger logger = new AndroidLogger(NAME);

  private RNSentryJsonConverter() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  @Nullable
  static WritableMap convertToWritable(@NotNull JSONObject jsonObject) {
    try {
      WritableMap writableMap = new JavaOnlyMap();
      Iterator<String> iterator = jsonObject.keys();
      while (iterator.hasNext()) {
        String key = iterator.next();
        Object value = jsonObject.get(key);
        if (value instanceof Float || value instanceof Double) {
          writableMap.putDouble(key, jsonObject.getDouble(key));
        } else if (value instanceof Number) {
          writableMap.putInt(key, jsonObject.getInt(key));
        } else if (value instanceof String) {
          writableMap.putString(key, jsonObject.getString(key));
        } else if (value instanceof JSONObject) {
          writableMap.putMap(key, convertToWritable(jsonObject.getJSONObject(key)));
        } else if (value instanceof JSONArray) {
          writableMap.putArray(key, convertToWritable(jsonObject.getJSONArray(key)));
        } else if (value == JSONObject.NULL) {
          writableMap.putNull(key);
        }
      }
      return writableMap;
    } catch (JSONException e) {
      logger.log(SentryLevel.ERROR, "Error parsing json object:" + e.getMessage());
      return null;
    }
  }

  @NotNull
  static WritableArray convertToWritable(@NotNull JSONArray jsonArray) throws JSONException {
    WritableArray writableArray = new JavaOnlyArray();
    for (int i = 0; i < jsonArray.length(); i++) {
      Object value = jsonArray.get(i);
      if (value instanceof Float || value instanceof Double) {
        writableArray.pushDouble(jsonArray.getDouble(i));
      } else if (value instanceof Number) {
        writableArray.pushInt(jsonArray.getInt(i));
      } else if (value instanceof String) {
        writableArray.pushString(jsonArray.getString(i));
      } else if (value instanceof JSONObject) {
        writableArray.pushMap(convertToWritable(jsonArray.getJSONObject(i)));
      } else if (value instanceof JSONArray) {
        writableArray.pushArray(convertToWritable(jsonArray.getJSONArray(i)));
      } else if (value == JSONObject.NULL) {
        writableArray.pushNull();
      }
    }
    return writableArray;
  }
}
