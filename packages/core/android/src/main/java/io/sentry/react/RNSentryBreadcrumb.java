package io.sentry.react;

import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import io.sentry.Breadcrumb;
import io.sentry.ILogger;
import io.sentry.Sentry;
import io.sentry.SentryLevel;
import io.sentry.util.MapObjectReader;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class RNSentryBreadcrumb {

  private RNSentryBreadcrumb() {
    throw new AssertionError("Utility class should not be instantiated");
  }

  @Nullable
  public static String getCurrentScreenFrom(ReadableMap from) {
    final @Nullable String maybeCategory =
        from.hasKey("category") ? from.getString("category") : null;
    if (maybeCategory == null || !"navigation".equals(maybeCategory)) {
      return null;
    }

    final @Nullable ReadableMap maybeData = from.hasKey("data") ? from.getMap("data") : null;
    if (maybeData == null) {
      return null;
    }

    try {
      // getString might throw if cast to string fails (data.to is not enforced by TS to be a
      // string)
      return maybeData.hasKey("to") ? maybeData.getString("to") : null;
    } catch (Throwable exception) { // NOPMD - We don't want to crash in any case
      return null;
    }
  }

  @NotNull
  public static Breadcrumb fromMap(ReadableMap from) {
    final @NotNull ILogger logger = Sentry.getCurrentScopes().getOptions().getLogger();
    try {
      final @NotNull MapObjectReader reader = new MapObjectReader(toDeepHashMap(from));
      final @NotNull Breadcrumb breadcrumb =
          new Breadcrumb.Deserializer().deserialize(reader, logger);

      if (breadcrumb.getLevel() == null) {
        breadcrumb.setLevel(SentryLevel.INFO);
      }
      if (breadcrumb.getOrigin() == null) {
        breadcrumb.setOrigin("react-native");
      }

      return breadcrumb;
    } catch (Exception e) {
      logger.log(SentryLevel.ERROR, "Failed to deserialize breadcrumb from map.", e);
      final Breadcrumb fallback = new Breadcrumb();
      fallback.setOrigin("react-native");
      return fallback;
    }
  }

  @NotNull
  static Map<String, Object> toDeepHashMap(@NotNull ReadableMap from) {
    final Map<String, Object> map = from.toHashMap();
    final ReadableMapKeySetIterator iterator = from.keySetIterator();
    while (iterator.hasNextKey()) {
      final String key = iterator.nextKey();
      if (from.getType(key) == ReadableType.Map) {
        final ReadableMap nested = from.getMap(key);
        if (nested != null) {
          map.put(key, toDeepHashMap(nested));
        }
      }
    }
    return map;
  }
}
