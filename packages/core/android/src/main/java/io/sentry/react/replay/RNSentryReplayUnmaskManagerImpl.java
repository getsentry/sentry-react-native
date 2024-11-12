package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.uimanager.ThemedReactContext;

public final class RNSentryReplayUnmaskManagerImpl {

  private RNSentryReplayUnmaskManagerImpl() {}

  public static final String REACT_CLASS = "RNSentryReplayUnmask";

  @NonNull
  public RNSentryReplayUnmask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayUnmask(context);
  }
}
