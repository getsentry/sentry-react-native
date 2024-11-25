package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;

@ReactModule(name = RNSentryReplayUnmaskManagerImpl.REACT_CLASS)
public class RNSentryReplayUnmaskManager extends ViewGroupManager<RNSentryReplayUnmask> {
  @NonNull
  @Override
  public String getName() {
    return RNSentryReplayUnmaskManagerImpl.REACT_CLASS;
  }

  @NonNull
  @Override
  public RNSentryReplayUnmask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayUnmask(context);
  }
}
