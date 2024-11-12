package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.uimanager.ThemedReactContext;

public final class RNSentryReplayMaskManagerImpl {

  private RNSentryReplayMaskManagerImpl() {}

  public static final String REACT_CLASS = "RNSentryReplayMask";

  @NonNull
  public static RNSentryReplayMask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayMask(context);
  }
}
