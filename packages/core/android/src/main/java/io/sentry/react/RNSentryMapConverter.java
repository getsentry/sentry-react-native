package io.sentry.react;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.JavaOnlyArray;
import com.facebook.react.bridge.JavaOnlyMap;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.json.JSONException;
import org.json.JSONObject;

public final class RNSentryMapConverter {
  public static final String NAME = "RNSentry.MapConverter";

  private static final ILogger logger = new AndroidLogger(NAME);

  private RNSentryMapConverter() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  public interface WritableArrayCreator {
    WritableArray create();
  }

  public interface WritableMapCreator {
    WritableMap create();
  }

  public static class WritableJavaArrayCreator implements WritableArrayCreator {
    @Override
    public WritableArray create() {
      return new JavaOnlyArray();
    }
  }

  public static class WritableJavaMapCreator implements WritableMapCreator {
    @Override
    public WritableMap create() {
      return new JavaOnlyMap();
    }
  }

  public static Object convertToJavaWritable(@Nullable Object serialized) {
    return convertToWritable(
        serialized, new WritableJavaArrayCreator(), new WritableJavaMapCreator());
  }

  public static class WritableNativeArrayCreator implements WritableArrayCreator {
    @Override
    public WritableArray create() {
      return Arguments.createArray();
    }
  }

  public static class WritableNativeMapCreator implements WritableMapCreator {
    @Override
    public WritableMap create() {
      return Arguments.createMap();
    }
  }

  public static Object convertToNativeWritable(@Nullable Object serialized) {
    return convertToWritable(
        serialized, new WritableNativeArrayCreator(), new WritableNativeMapCreator());
  }

  private static Object convertToWritable(
      @Nullable Object serialized,
      @NotNull WritableArrayCreator arrayCreator,
      @NotNull WritableMapCreator mapCreator) {
    if (serialized instanceof List) {
      WritableArray writable = arrayCreator.create();
      for (Object item : (List<?>) serialized) {
        addValueToWritableArray(writable, convertToWritable(item, arrayCreator, mapCreator));
      }
      return writable;
    } else if (serialized instanceof Map) {
      WritableMap writable = mapCreator.create();
      for (Map.Entry<?, ?> entry : ((Map<?, ?>) serialized).entrySet()) {
        Object key = entry.getKey();
        Object value = entry.getValue();

        if (key instanceof String) {
          addValueToWritableMap(
              writable, (String) key, convertToWritable(value, arrayCreator, mapCreator));
        } else {
          logger.log(SentryLevel.ERROR, "Only String keys are supported in Map.", key);
        }
      }
      return writable;
    } else if (serialized instanceof Byte) {
      return Integer.valueOf((Byte) serialized);
    } else if (serialized instanceof Short) {
      return Integer.valueOf((Short) serialized);
    } else if (serialized instanceof Float) {
      return Double.valueOf((Float) serialized);
    } else if (serialized instanceof Long) {
      return Double.valueOf((Long) serialized);
    } else if (serialized instanceof BigInteger) {
      return ((BigInteger) serialized).doubleValue();
    } else if (serialized instanceof BigDecimal) {
      return ((BigDecimal) serialized).doubleValue();
    } else if (serialized instanceof Integer
        || serialized instanceof Double
        || serialized instanceof Boolean
        || serialized == null
        || serialized instanceof String) {
      return serialized;
    } else {
      logger.log(
          SentryLevel.ERROR, "Supplied serialized value could not be converted." + serialized);
      return null;
    }
  }

  private static void addValueToWritableArray(WritableArray writableArray, Object value) {
    if (value == null) {
      writableArray.pushNull();
    } else if (value instanceof Boolean) {
      writableArray.pushBoolean((Boolean) value);
    } else if (value instanceof Double) {
      writableArray.pushDouble((Double) value);
    } else if (value instanceof Float) {
      writableArray.pushDouble(((Float) value).doubleValue());
    } else if (value instanceof Integer) {
      writableArray.pushInt((Integer) value);
    } else if (value instanceof Short) {
      writableArray.pushInt(((Short) value).intValue());
    } else if (value instanceof Byte) {
      writableArray.pushInt(((Byte) value).intValue());
    } else if (value instanceof Long) {
      writableArray.pushDouble(((Long) value).doubleValue());
    } else if (value instanceof BigInteger) {
      writableArray.pushDouble(((BigInteger) value).doubleValue());
    } else if (value instanceof BigDecimal) {
      writableArray.pushDouble(((BigDecimal) value).doubleValue());
    } else if (value instanceof String) {
      writableArray.pushString((String) value);
    } else if (value instanceof ReadableMap) {
      writableArray.pushMap((ReadableMap) value);
    } else if (value instanceof ReadableArray) {
      writableArray.pushArray((ReadableArray) value);
    } else {
      logger.log(SentryLevel.ERROR, "Could not convert object: " + value);
    }
  }

  private static void addValueToWritableMap(WritableMap writableMap, String key, Object value) {
    if (value == null) {
      writableMap.putNull(key);
    } else if (value instanceof Boolean) {
      writableMap.putBoolean(key, (Boolean) value);
    } else if (value instanceof Double) {
      writableMap.putDouble(key, (Double) value);
    } else if (value instanceof Float) {
      writableMap.putDouble(key, ((Float) value).doubleValue());
    } else if (value instanceof Integer) {
      writableMap.putInt(key, (Integer) value);
    } else if (value instanceof Short) {
      writableMap.putInt(key, ((Short) value).intValue());
    } else if (value instanceof Byte) {
      writableMap.putInt(key, ((Byte) value).intValue());
    } else if (value instanceof Long) {
      writableMap.putDouble(key, ((Long) value).doubleValue());
    } else if (value instanceof BigInteger) {
      writableMap.putDouble(key, ((BigInteger) value).doubleValue());
    } else if (value instanceof BigDecimal) {
      writableMap.putDouble(key, ((BigDecimal) value).doubleValue());
    } else if (value instanceof String) {
      writableMap.putString(key, (String) value);
    } else if (value instanceof ReadableArray) {
      writableMap.putArray(key, (ReadableArray) value);
    } else if (value instanceof ReadableMap) {
      writableMap.putMap(key, (ReadableMap) value);
    } else {
      logger.log(SentryLevel.ERROR, "Could not convert object" + value);
    }
  }

  public static ReadableMap jsonObjectToReadableMap(JSONObject jsonObject) {
    Map<String, Object> map = jsonObjectToMap(jsonObject);
    return mapToReadableMap(map);
  }

  public static ReadableMap mapToReadableMap(Map<String, Object> map) {
    // We are not directly using `convertToWritable` since `Arguments.createArray()`
    // fails before bridge initialisation
    Object[] keysAndValues = new Object[map.size() * 2];
    int index = 0;
    for (Map.Entry<String, Object> entry : map.entrySet()) {
      keysAndValues[index++] = entry.getKey();
      keysAndValues[index++] = entry.getValue();
    }
    return JavaOnlyMap.of(keysAndValues);
  }

  private static Map<String, Object> jsonObjectToMap(JSONObject jsonObject) {
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
}
