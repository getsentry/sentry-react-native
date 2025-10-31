package io.sentry.react;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.EventDispatcherListener;
import io.sentry.ILogger;
import io.sentry.Integration;
import io.sentry.ScopesAdapter;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;
import io.sentry.android.replay.ReplayIntegration;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class RNSentryReactFragmentLifecycleTracer extends FragmentLifecycleCallbacks {

  private @NotNull final BuildInfoProvider buildInfoProvider;
  private @NotNull final Runnable emitNewFrameEvent;
  private @NotNull final ILogger logger;

  private @Nullable ReplayIntegration replayIntegration;
  private int lastWidth = -1;
  private int lastHeight = -1;

  private @Nullable View currentView;
  private @Nullable ViewTreeObserver.OnGlobalLayoutListener currentListener;

  public RNSentryReactFragmentLifecycleTracer(
      @NotNull BuildInfoProvider buildInfoProvider,
      @NotNull Runnable emitNewFrameEvent,
      @NotNull ILogger logger) {
    this.buildInfoProvider = buildInfoProvider;
    this.emitNewFrameEvent = emitNewFrameEvent;
    this.logger = logger;
  }

  @Override
  public void onFragmentViewCreated(
      @NotNull FragmentManager fm,
      @NotNull Fragment f,
      @NotNull View v,
      @Nullable Bundle savedInstanceState) {
    if (!"com.swmansion.rnscreens.ScreenStackFragment".equals(f.getClass().getCanonicalName())) {
      logger.log(
          SentryLevel.DEBUG,
          "Fragment is not a ScreenStackFragment, won't listen for the first draw.");
      return;
    }

    if (!(v instanceof ViewGroup)) {
      logger.log(
          SentryLevel.WARNING,
          "Fragment view is not a ViewGroup, won't listen for the first draw.");
      return;
    }

    final ViewGroup viewGroup = (ViewGroup) v;
    if (viewGroup.getChildCount() == 0) {
      logger.log(
          SentryLevel.WARNING, "Fragment view has no children, won't listen for the first draw.");
      return;
    }

    final @Nullable View screen = viewGroup.getChildAt(0);
    if (screen == null || !(screen.getContext() instanceof ReactContext)) {
      logger.log(
          SentryLevel.WARNING,
          "Fragment view has no ReactContext, won't listen for the first draw.");
      return;
    }

    final int screenId = screen.getId();
    if (screenId == View.NO_ID) {
      logger.log(SentryLevel.WARNING, "Screen has no id, won't listen for the first draw.");
      return;
    }

    final @Nullable EventDispatcher eventDispatcher =
        getEventDispatcherForReactTag(screen, screenId);
    if (eventDispatcher == null) {
      logger.log(
          SentryLevel.WARNING, "Screen has no event dispatcher, won't listen for the first draw.");
      return;
    }

    final @NotNull Runnable emitNewFrameEvent = this.emitNewFrameEvent;
    eventDispatcher.addListener(
        new EventDispatcherListener() {
          @Override
          public void onEventDispatch(Event event) {
            if ("com.swmansion.rnscreens.events.ScreenAppearEvent"
                .equals(event.getClass().getCanonicalName())) {
              eventDispatcher.removeListener(this);
              FirstDrawDoneListener.registerForNextDraw(v, emitNewFrameEvent, buildInfoProvider);
            }
          }
        });

    // Add layout listener to detect configuration changes after detaching any previous one
    detachLayoutChangeListener();
    attachLayoutChangeListener(v);
  }

  @Override
  public void onFragmentViewDestroyed(@NonNull FragmentManager fm, @NonNull Fragment f) {
    detachLayoutChangeListener();
  }

  private void attachLayoutChangeListener(final View view) {
    final ViewTreeObserver.OnGlobalLayoutListener listener =
        new ViewTreeObserver.OnGlobalLayoutListener() {
          @Override
          public void onGlobalLayout() {
            checkAndNotifyWindowSizeChange(view);
          }
        };

    currentView = view;
    currentListener = listener;

    view.getViewTreeObserver().addOnGlobalLayoutListener(listener);
  }

  private void detachLayoutChangeListener() {
    if (currentView != null && currentListener != null) {
      try {
        currentView.getViewTreeObserver().removeOnGlobalLayoutListener(currentListener);
      } catch (Exception e) {
        logger.log(SentryLevel.DEBUG, "Failed to remove layout change listener", e);
      }
    }

    currentView = null;
    currentListener = null;
  }

  private void checkAndNotifyWindowSizeChange(View view) {
    try {
      android.util.DisplayMetrics metrics = view.getContext().getResources().getDisplayMetrics();
      int currentWidth = metrics.widthPixels;
      int currentHeight = metrics.heightPixels;

      if (lastWidth != currentWidth || lastHeight != currentHeight) {
        lastWidth = currentWidth;
        lastHeight = currentHeight;

        notifyReplayIntegrationOfSizeChange(currentWidth, currentHeight);
      }
    } catch (Exception e) {
      logger.log(SentryLevel.DEBUG, "Failed to check window size", e);
    }
  }

  private void notifyReplayIntegrationOfSizeChange(int width, int height) {
    if (replayIntegration == null) {
      replayIntegration = getReplayIntegration();
    }

    if (replayIntegration == null) {
      return;
    }
    
    try {
      replayIntegration.onWindowSizeChanged(width, height);
    } catch (Exception e) {
      logger.log(SentryLevel.DEBUG, "Failed to notify replay integration of size change", e);
    }
  }

  private @Nullable ReplayIntegration getReplayIntegration() {
    try {
      final SentryOptions options = ScopesAdapter.getInstance().getOptions();
      if (options == null) {
        return null;
      }

      for (Integration integration : options.getIntegrations()) {
        if (integration instanceof ReplayIntegration) {
          return (ReplayIntegration) integration;
        }
      }
    } catch (Exception e) {
      logger.log(SentryLevel.DEBUG, "Error getting replay integration", e);
    }
    return null;
  }

  private static @Nullable EventDispatcher getEventDispatcherForReactTag(
      @NonNull View screen, int screenId) {
    return UIManagerHelper.getEventDispatcherForReactTag(
        UIManagerHelper.getReactContext(screen), screenId);
  }
}
