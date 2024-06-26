package io.sentry.react;

import io.sentry.Breadcrumb;
import io.sentry.android.replay.DefaultReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebEvent;
import io.sentry.rrweb.RRWebBreadcrumbEvent;
import java.util.ArrayList;
import java.util.HashMap;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class RNSentryReplayBreadcrumbConverter extends DefaultReplayBreadcrumbConverter {
  public RNSentryReplayBreadcrumbConverter() {
  }

  @Override
  public @Nullable RRWebEvent convert(final @NotNull Breadcrumb breadcrumb) {
    RRWebBreadcrumbEvent rrwebBreadcrumb = new RRWebBreadcrumbEvent();
    assert rrwebBreadcrumb.getCategory() == null;

    if (breadcrumb.getCategory().equals("touch")) {
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
      rrwebBreadcrumb.setData(breadcrumb.getData());
    }

    if (rrwebBreadcrumb.getCategory() != null && !rrwebBreadcrumb.getCategory().isEmpty()) {
      rrwebBreadcrumb.setTimestamp(breadcrumb.getTimestamp().getTime());
      rrwebBreadcrumb.setBreadcrumbTimestamp(breadcrumb.getTimestamp().getTime() / 1000.0);
      rrwebBreadcrumb.setBreadcrumbType("default");
      return rrwebBreadcrumb;
    }

    return super.convert(breadcrumb);
  }
}
