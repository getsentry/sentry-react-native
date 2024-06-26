package io.sentry.react;

import io.sentry.Breadcrumb;
import io.sentry.android.replay.DefaultReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebEvent;
import io.sentry.rrweb.RRWebBreadcrumbEvent;
import io.sentry.rrweb.RRWebSpanEvent;

import java.util.ArrayList;
import java.util.HashMap;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.TestOnly;

import java.util.HashMap;

public final class RNSentryReplayBreadcrumbConverter extends DefaultReplayBreadcrumbConverter {
  public RNSentryReplayBreadcrumbConverter() {
  }

  @Override
  public @Nullable RRWebEvent convert(final @NotNull Breadcrumb breadcrumb) {
    if (breadcrumb.getCategory() == null) {
      return null;
    }

    if (breadcrumb.getCategory().equals("touch")) {
      return convertTouchBreadcrumb(breadcrumb);
    }
    if (breadcrumb.getCategory().equals("navigation")) {
      final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();
      rrwebBreadcrumb.setCategory(breadcrumb.getCategory());
      rrwebBreadcrumb.setData(breadcrumb.getData());
      return rrwebBreadcrumb;
    }
    if (breadcrumb.getCategory().equals("xhr")) {
      return convertNetworkBreadcrumb(breadcrumb);
    }
    if (breadcrumb.getCategory().equals("http")) {
      // Drop native http breadcrumbs to avoid duplicates
      return null;
    }

    RRWebEvent nativeBreadcrumb = super.convert(breadcrumb);

    // ignore native navigation breadcrumbs
    if (nativeBreadcrumb instanceof RRWebBreadcrumbEvent) {
      rrwebBreadcrumb = (RRWebBreadcrumbEvent) nativeBreadcrumb;
      if (rrwebBreadcrumb.getCategory() != null && rrwebBreadcrumb.getCategory().equals("navigation")) {
        return null;
      }
    }

    return nativeBreadcrumb;
  }

  @TestOnly
  public @NotNull RRWebEvent convertTouchBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();

    rrwebBreadcrumb.setCategory("ui.tap");
    ArrayList path = (ArrayList) breadcrumb.getData("path");
    if (path != null) {
      StringBuilder message = new StringBuilder();
      for (int i = Math.min(3, path.size()); i >= 0; i--) {
        HashMap item = (HashMap) path.get(i);
        message.append(item.get("name"));
        if (item.containsKey("element") || item.containsKey("file")) {
          message.append('(');
          if (item.containsKey("element")) {
            message.append(item.get("element"));
            if (item.containsKey("file")) {
              message.append(", ");
              message.append(item.get("file"));
            }
          } else if (item.containsKey("file")) {
            message.append(item.get("file"));
          }
          message.append(')');
        }
        if (i > 0) {
          message.append(" > ");
        }
      }
      rrwebBreadcrumb.setMessage(message.toString());
    }

    rrwebBreadcrumb.setLevel(breadcrumb.getLevel());
    rrWebBreadcrumb.setData(breadcrumb.getData());
    rrWebBreadcrumb.setTimestamp(breadcrumb.getTimestamp().getTime());
    rrWebBreadcrumb.setBreadcrumbTimestamp(breadcrumb.getTimestamp().getTime() / 1000.0);
    rrWebBreadcrumb.setBreadcrumbType("default");
    return rrWebBreadcrumb;
  }

  @TestOnly
  public @Nullable RRWebEvent convertNetworkBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    final Double startTimestamp = breadcrumb.getData("start_timestamp") instanceof Number
            ? (Double) breadcrumb.getData("start_timestamp") : null;
    final Double endTimestamp = breadcrumb.getData("end_timestamp") instanceof Number
            ? (Double) breadcrumb.getData("end_timestamp") : null;
    final String url = breadcrumb.getData("url") instanceof String
            ? (String) breadcrumb.getData("url") : null;

    if (startTimestamp == null || endTimestamp == null || url == null) {
      return null;
    }

    final HashMap<String, Object> data = new HashMap<>();
    if (breadcrumb.getData("method") instanceof String) {
      data.put("method", breadcrumb.getData("method"));
    }
    if (breadcrumb.getData("status_code") instanceof Double) {
      final Double statusCode = (Double) breadcrumb.getData("status_code");
      if (statusCode > 0) {
        data.put("statusCode", statusCode.intValue());
      }
    }
    if (breadcrumb.getData("request_body_size") instanceof Double) {
      data.put("requestBodySize", breadcrumb.getData("request_body_size"));
    }
    if (breadcrumb.getData("response_body_size") instanceof Double) {
      data.put("responseBodySize", breadcrumb.getData("response_body_size"));
    }

    final RRWebSpanEvent rrWebSpanEvent = new RRWebSpanEvent();
    rrWebSpanEvent.setOp("resource.http");
    rrWebSpanEvent.setStartTimestamp(startTimestamp / 1000.0);
    rrWebSpanEvent.setEndTimestamp(endTimestamp / 1000.0);
    rrWebSpanEvent.setDescription(url);
    rrWebSpanEvent.setData(data);
    return rrWebSpanEvent;
  }
}
