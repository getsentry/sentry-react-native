package io.sentry.android.replay;

import io.sentry.Breadcrumb;
import io.sentry.ReplayBreadcrumbConverter;
import io.sentry.rrweb.RRWebEvent;

// just a stub to make the build pass when sentry-android-replay is not present
public class DefaultReplayBreadcrumbConverter implements ReplayBreadcrumbConverter {
  @Override
  public RRWebEvent convert(Breadcrumb breadcrumb) {
    return null;
  }
}
