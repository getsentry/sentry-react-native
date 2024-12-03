package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;

@ReactModule(name = RNSentryReplayMaskManagerImpl.REACT_CLASS)
public class RNSentryReplayMaskManager extends ViewGroupManager<RNSentryReplayMask> {
  @NonNull
  @Override
  public String getName() {
    return RNSentryReplayMaskManagerImpl.REACT_CLASS;
  }

  @NonNull
  @Override
  public RNSentryReplayMask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayMask(context);
  }
}
