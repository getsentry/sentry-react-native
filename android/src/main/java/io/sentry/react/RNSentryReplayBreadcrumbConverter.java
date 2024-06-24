package io.sentry.react;

import io.sentry.Breadcrumb;
import io.sentry.android.replay.DefaultReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebEvent;
import io.sentry.rrweb.RRWebBreadcrumbEvent;
import io.sentry.rrweb.RRWebSpanEvent;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

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
    if (breadcrumb.getCategory().equals("xhr")) {
      return convertNetworkBreadcrumb(breadcrumb);
    }
    if (breadcrumb.getCategory().equals("http")) {
      return null;
    }
    return super.convert(breadcrumb);
  }

  private @NotNull RRWebEvent convertTouchBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
    final RRWebBreadcrumbEvent rrWebBreadcrumb = new RRWebBreadcrumbEvent();
    assert rrWebBreadcrumb.getCategory() == null;
    rrWebBreadcrumb.setCategory("ui.tap");
    final Object target = breadcrumb.getData("target");
    if (target != null) {
      rrWebBreadcrumb.setMessage(target.toString());
    }
    rrWebBreadcrumb.setData(breadcrumb.getData());
    rrWebBreadcrumb.setTimestamp(breadcrumb.getTimestamp().getTime());
    rrWebBreadcrumb.setBreadcrumbTimestamp(breadcrumb.getTimestamp().getTime() / 1000.0);
    rrWebBreadcrumb.setBreadcrumbType("default");
    return rrWebBreadcrumb;
  }

  private @Nullable RRWebEvent convertNetworkBreadcrumb(final @NotNull Breadcrumb breadcrumb) {
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
