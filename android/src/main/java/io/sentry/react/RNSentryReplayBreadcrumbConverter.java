package io.sentry.react;

import io.sentry.Breadcrumb;
import io.sentry.android.replay.DefaultReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebEvent;
import io.sentry.rrweb.RRWebBreadcrumbEvent;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public final class RNSentryReplayBreadcrumbConverter extends DefaultReplayBreadcrumbConverter {
  public RNSentryReplayBreadcrumbConverter() {
  }

  @Override
  public @Nullable RRWebEvent convert(final @NotNull Breadcrumb breadcrumb) {
    var rrwebBreadcrumb = new RRWebBreadcrumbEvent();
    assert rrwebBreadcrumb.getCategory() == null;

    if (breadcrumb.getCategory().equals("touch")) {
      rrwebBreadcrumb.setCategory("ui.tap");
      Object target = breadcrumb.getData("target");
      if (target != null) {
        rrwebBreadcrumb.setMessage(target.toString());
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
