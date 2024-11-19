package io.sentry.react;

import com.facebook.react.bridge.ReadableMap;
import io.sentry.Breadcrumb;
import io.sentry.SentryLevel;
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
    final @NotNull Breadcrumb breadcrumb = new Breadcrumb();

    if (from.hasKey("message")) {
      breadcrumb.setMessage(from.getString("message"));
    }

    if (from.hasKey("type")) {
      breadcrumb.setType(from.getString("type"));
    }

    if (from.hasKey("category")) {
      breadcrumb.setCategory(from.getString("category"));
    }

    if (from.hasKey("origin")) {
      breadcrumb.setOrigin(from.getString("origin"));
    } else {
      breadcrumb.setOrigin("react-native");
    }

    if (from.hasKey("level")) {
      switch (from.getString("level")) {
        case "fatal":
          breadcrumb.setLevel(SentryLevel.FATAL);
          break;
        case "warning":
          breadcrumb.setLevel(SentryLevel.WARNING);
          break;
        case "debug":
          breadcrumb.setLevel(SentryLevel.DEBUG);
          break;
        case "error":
          breadcrumb.setLevel(SentryLevel.ERROR);
          break;
        case "info":
        default:
          breadcrumb.setLevel(SentryLevel.INFO);
          break;
      }
    }

    if (from.hasKey("data")) {
      final ReadableMap data = from.getMap("data");
      for (final Map.Entry<String, Object> entry : data.toHashMap().entrySet()) {
        final Object value = entry.getValue();
        // data is ConcurrentHashMap and can't have null values
        if (value != null) {
          breadcrumb.setData(entry.getKey(), entry.getValue());
        }
      }
    }

    return breadcrumb;
  }
}
