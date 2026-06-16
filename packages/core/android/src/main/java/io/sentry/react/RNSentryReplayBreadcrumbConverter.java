package io.sentry.react;

import io.sentry.Breadcrumb;
import io.sentry.android.replay.DefaultReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebBreadcrumbEvent;
import io.sentry.rrweb.RRWebEvent;
import io.sentry.rrweb.RRWebSpanEvent;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.TestOnly;

public final class RNSentryReplayBreadcrumbConverter extends DefaultReplayBreadcrumbConverter {
  @Override
  public @Nullable RRWebEvent convert(final @NotNull Breadcrumb breadcrumb) {
    if (breadcrumb.getCategory() == null) {
      return null;
    }

    // Do not add Sentry Event breadcrumbs to replay
    if ("sentry.event".equals(breadcrumb.getCategory())
        || "sentry.transaction".equals(breadcrumb.getCategory())) {
      return null;
    }
    if ("http".equals(breadcrumb.getCategory())) {
      // Drop native http breadcrumbs to avoid duplicates
      return null;
    }

    if ("touch".equals(breadcrumb.getCategory())) {
      return convertTouchBreadcrumb(breadcrumb);
    }
    if ("ui.multiClick".equals(breadcrumb.getCategory())) {
      return convertMultiClickBreadcrumb(breadcrumb);
    }
    if ("navigation".equals(breadcrumb.getCategory())) {
      return convertNavigationBreadcrumb(breadcrumb);
    }
    if ("xhr".equals(breadcrumb.getCategory())) {
      return convertNetworkBreadcrumb(breadcrumb);
    }

    RRWebEvent nativeBreadcrumb = super.convert(breadcrumb);

    // ignore native navigation breadcrumbs
    if (nativeBreadcrumb instanceof RRWebBreadcrumbEvent) {
      final RRWebBreadcrumbEvent rrWebBreadcrumb = (RRWebBreadcrumbEvent) nativeBreadcrumb;
      if ("navigation".equals(rrWebBreadcrumb.getCategory())) {
        return null;
      }
    }

    return nativeBreadcrumb;
  }

  @TestOnly
  public @NotNull RRWebEvent convertNavigationBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();
    rrWebBreadcrumb.setCategory(breadcrumb.getCategory());
    setRRWebEventDefaultsFrom(rrWebBreadcrumb, breadcrumb);
    return rrWebBreadcrumb;
  }

  @TestOnly
  public @NotNull RRWebEvent convertTouchBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();

    rrWebBreadcrumb.setCategory("ui.tap");

    rrWebBreadcrumb.setMessage(getTouchPathMessage(breadcrumb.getData("path")));

    setRRWebEventDefaultsFrom(rrWebBreadcrumb, breadcrumb);
    return rrWebBreadcrumb;
  }

  public @Nullable RRWebEvent convertMultiClickBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    if (!(breadcrumb.getData("path") instanceof List)) {
      return null;
    }

    final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();

    rrWebBreadcrumb.setCategory("ui.multiClick");

    rrWebBreadcrumb.setMessage(getTouchPathMessage(breadcrumb.getData("path")));

    setRRWebEventDefaultsFrom(rrWebBreadcrumb, breadcrumb);
    return rrWebBreadcrumb;
  }

  @TestOnly
  public static @Nullable String getTouchPathMessage(final @Nullable Object maybePath) {
    if (!(maybePath instanceof List)) {
      return null;
    }

    final @NotNull List path = (List) maybePath;
    if (path.isEmpty()) {
      return null;
    }

    final @NotNull StringBuilder message = new StringBuilder();
    for (int i = Math.min(3, path.size() - 1); i >= 0; i--) {
      final @Nullable Object maybeItem = path.get(i);
      if (!(maybeItem instanceof Map)) {
        return null;
      }

      final @NotNull Map item = (Map) maybeItem;
      final @Nullable Object maybeName = item.get("name");
      final @Nullable Object maybeLabel = item.get("label");
      boolean hasName = maybeName instanceof String;
      boolean hasLabel = maybeLabel instanceof String;
      if (!hasName && !hasLabel) {
        return null; // This again should never be allowed in JS, but to be safe we check it here
      }
      if (hasLabel) {
        message.append(maybeLabel);
      } else { // hasName is true
        message.append(maybeName);
      }

      final @Nullable Object maybeElement = item.get("element");
      final @Nullable Object maybeFile = item.get("file");
      boolean hasElement = maybeElement instanceof String;
      boolean hasFile = maybeFile instanceof String;
      if (hasElement && hasFile) {
        message.append('(').append(maybeElement).append(", ").append(maybeFile).append(')');
      } else if (hasElement) {
        message.append('(').append(maybeElement).append(')');
      } else if (hasFile) {
        message.append('(').append(maybeFile).append(')');
      }

      if (i > 0) {
        message.append(" > ");
      }
    }

    return message.toString();
  }

  @TestOnly
  public @Nullable RRWebEvent convertNetworkBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    // Use Number.doubleValue() rather than a direct (Double) cast: the RN bridge can
    // surface timestamps as Long/Integer, which pass `instanceof Number` but would
    // throw `ClassCastException` on a direct cast to Double.
    final Double startTimestamp =
        breadcrumb.getData("start_timestamp") instanceof Number
            ? ((Number) breadcrumb.getData("start_timestamp")).doubleValue()
            : null;
    final Double endTimestamp =
        breadcrumb.getData("end_timestamp") instanceof Number
            ? ((Number) breadcrumb.getData("end_timestamp")).doubleValue()
            : null;
    final String url =
        breadcrumb.getData("url") instanceof String ? (String) breadcrumb.getData("url") : null;

    if (startTimestamp == null || endTimestamp == null || url == null) {
      return null;
    }

    final Map<String, Object> data = new HashMap<>();
    if (breadcrumb.getData("method") instanceof String) {
      data.put("method", breadcrumb.getData("method"));
    }
    // Accept any Number subtype (Double/Long/Integer) — the RN bridge does not guarantee Double.
    if (breadcrumb.getData("status_code") instanceof Number) {
      final int statusCode = ((Number) breadcrumb.getData("status_code")).intValue();
      if (statusCode > 0) {
        data.put("statusCode", statusCode);
      }
    }
    if (breadcrumb.getData("request_body_size") instanceof Number) {
      data.put("requestBodySize", ((Number) breadcrumb.getData("request_body_size")).doubleValue());
    }
    if (breadcrumb.getData("response_body_size") instanceof Number) {
      data.put("responseBodySize", ((Number) breadcrumb.getData("response_body_size")).doubleValue());
    }
    final Map<Object, Object> requestSide = sanitizeNetworkSide(breadcrumb.getData("request"));
    if (!requestSide.isEmpty()) {
      data.put("request", requestSide);
    }
    final Map<Object, Object> responseSide = sanitizeNetworkSide(breadcrumb.getData("response"));
    if (!responseSide.isEmpty()) {
      data.put("response", responseSide);
    }

    final RRWebSpanEvent rrWebSpanEvent = new RRWebSpanEvent();
    rrWebSpanEvent.setOp("resource.http");
    rrWebSpanEvent.setStartTimestamp(startTimestamp / 1000.0);
    rrWebSpanEvent.setEndTimestamp(endTimestamp / 1000.0);
    rrWebSpanEvent.setDescription(url);
    rrWebSpanEvent.setData(data);
    return rrWebSpanEvent;
  }

  /**
   * Copy a JS-emitted request/response side dict, dropping the JS-internal `_meta` warnings field
   * so it does not leak into the native rrweb span event. Returns an empty map when the input is
   * not a Map or has no remaining fields.
   */
  private @NotNull Map<Object, Object> sanitizeNetworkSide(final @Nullable Object raw) {
    if (!(raw instanceof Map)) {
      return new HashMap<>();
    }
    final Map<?, ?> source = (Map<?, ?>) raw;
    final Map<Object, Object> out = new HashMap<>(source);
    out.remove("_meta");
    return out;
  }

  private void setRRWebEventDefaultsFrom(
      final @NotNull RRWebBreadcrumbEvent rrWebBreadcrumb, final @NotNull Breadcrumb breadcrumb) {
    rrWebBreadcrumb.setLevel(breadcrumb.getLevel());
    rrWebBreadcrumb.setData(breadcrumb.getData());
    rrWebBreadcrumb.setTimestamp(breadcrumb.getTimestamp().getTime());
    rrWebBreadcrumb.setBreadcrumbTimestamp(breadcrumb.getTimestamp().getTime() / 1000.0);
    rrWebBreadcrumb.setBreadcrumbType("default");
  }
}
