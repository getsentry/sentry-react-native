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
    if (breadcrumb.getCategory().equals("touch")) {
      RRWebBreadcrumbEvent rrwebBreadcrumb = new RRWebBreadcrumbEvent();
      assert rrwebBreadcrumb.getCategory() == null;
      rrwebBreadcrumb.setCategory("ui.tap");
      Object target = breadcrumb.getData("target");
      if (target != null) {
        rrwebBreadcrumb.setMessage(target.toString());
      }
      rrwebBreadcrumb.setData(breadcrumb.getData());
      rrwebBreadcrumb.setTimestamp(breadcrumb.getTimestamp().getTime());
      rrwebBreadcrumb.setBreadcrumbTimestamp(breadcrumb.getTimestamp().getTime() / 1000.0);
      rrwebBreadcrumb.setBreadcrumbType("default");
      return rrwebBreadcrumb;
    } else if (breadcrumb.getCategory().equals("xhr")) {
      Double startTimestamp = breadcrumb.getData("start_timestamp") instanceof Number
        ? (Double) breadcrumb.getData("start_timestamp") : null;
      Double endTimestamp = breadcrumb.getData("end_timestamp") instanceof Number
              ? (Double) breadcrumb.getData("end_timestamp") : null;
      String url = breadcrumb.getData("url") instanceof String
              ? (String) breadcrumb.getData("url") : null;

      if (startTimestamp == null || endTimestamp == null || url == null) {
        return null;
      }

      HashMap<String, Object> data = new HashMap<>();
      if (breadcrumb.getData("method") instanceof String) {
        data.put("method", breadcrumb.getData("method"));
      }
      if (breadcrumb.getData("status_code") instanceof Double) {
        Double statusCode = (Double) breadcrumb.getData("status_code");
        if (statusCode > 0) {
          data.put("status_code", breadcrumb.getData("status_code"));
        }
      }
      if (breadcrumb.getData("request_body_size") instanceof Double) {
        data.put("request_content_length", breadcrumb.getData("request_body_size"));
      }
      if (breadcrumb.getData("response_body_size") instanceof Double) {
        data.put("response_content_length", breadcrumb.getData("response_body_size"));
      }

      RRWebSpanEvent rrWebSpanEvent = new RRWebSpanEvent();
      rrWebSpanEvent.setOp("resource.http");
      rrWebSpanEvent.setStartTimestamp(startTimestamp / 1000.0);
      rrWebSpanEvent.setEndTimestamp(endTimestamp / 1000.0);
      rrWebSpanEvent.setDescription(url);
      rrWebSpanEvent.setData(data);
      return rrWebSpanEvent;
    } else if (breadcrumb.getCategory().equals("http")) {
      return null;
    }

    return super.convert(breadcrumb);
  }
}
