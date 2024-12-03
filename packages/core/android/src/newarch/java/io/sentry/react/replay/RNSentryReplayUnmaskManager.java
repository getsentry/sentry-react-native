package io.sentry.react.replay;

import androidx.annotation.NonNull;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.ViewGroupManager;
import com.facebook.react.uimanager.ViewManagerDelegate;
import com.facebook.react.viewmanagers.RNSentryReplayUnmaskManagerDelegate;
import com.facebook.react.viewmanagers.RNSentryReplayUnmaskManagerInterface;

@ReactModule(name = RNSentryReplayMaskManagerImpl.REACT_CLASS)
public class RNSentryReplayUnmaskManager extends ViewGroupManager<RNSentryReplayUnmask>
    implements RNSentryReplayUnmaskManagerInterface<RNSentryReplayUnmask> {
  private final RNSentryReplayUnmaskManagerDelegate<
          RNSentryReplayUnmask, RNSentryReplayUnmaskManager>
      delegate = new RNSentryReplayUnmaskManagerDelegate<>(this);

  @Override
  public ViewManagerDelegate<RNSentryReplayUnmask> getDelegate() {
    return delegate;
  }

  @NonNull
  @Override
  public String getName() {
    return RNSentryReplayMaskManagerImpl.REACT_CLASS;
  }

  @NonNull
  @Override
  public RNSentryReplayUnmask createViewInstance(@NonNull ThemedReactContext context) {
    return new RNSentryReplayUnmask(context);
  }
}
