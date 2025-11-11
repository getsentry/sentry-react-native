package io.sentry.react.replay;

import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewTreeObserver;
import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks;
import io.sentry.ILogger;
import io.sentry.ReplayController;
import io.sentry.ScopesAdapter;
import io.sentry.SentryLevel;
import io.sentry.android.replay.ReplayIntegration;
import java.lang.ref.WeakReference;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class RNSentryReplayFragmentLifecycleTracer extends FragmentLifecycleCallbacks {
  private @NotNull final ILogger logger;

  private @Nullable ReplayIntegration replayIntegration;

  private int lastWidth = -1;
  private int lastHeight = -1;

  private @Nullable WeakReference<View> currentViewRef;
  private @Nullable ViewTreeObserver.OnGlobalLayoutListener currentListener;

  public RNSentryReplayFragmentLifecycleTracer(@NotNull ILogger logger) {
    this.logger = logger;
  }

  @Override
  public void onFragmentViewCreated(
      @NotNull FragmentManager fm,
      @NotNull Fragment f,
      @NotNull View v,
      @Nullable Bundle savedInstanceState) {
    // Add layout listener to detect configuration changes after detaching any previous one
    detachLayoutChangeListener();
    attachLayoutChangeListener(v);
  }

  @Override
  public void onFragmentViewDestroyed(@NonNull FragmentManager fm, @NonNull Fragment f) {
    detachLayoutChangeListener();
  }

  private void attachLayoutChangeListener(final View view) {
    final WeakReference<View> weakView = new WeakReference<>(view);

    final ViewTreeObserver.OnGlobalLayoutListener listener =
        new ViewTreeObserver.OnGlobalLayoutListener() {
          @Override
          public void onGlobalLayout() {
            final View v = weakView.get();
            if (v != null) {
              checkAndNotifyWindowSizeChange(v);
            }
          }
        };

    currentViewRef = new WeakReference<>(view);
    currentListener = listener;

    view.getViewTreeObserver().addOnGlobalLayoutListener(listener);
  }

  private void detachLayoutChangeListener() {
    final View view = currentViewRef != null ? currentViewRef.get() : null;
    if (view != null && currentListener != null) {
      try {
        ViewTreeObserver observer = view.getViewTreeObserver();
        if (observer != null) {
          observer.removeOnGlobalLayoutListener(currentListener);
        }
      } catch (Exception e) {
        logger.log(SentryLevel.DEBUG, "Failed to remove layout change listener", e);
      }
    }

    currentViewRef = null;
    currentListener = null;
  }

  private void checkAndNotifyWindowSizeChange(View view) {
    try {
      DisplayMetrics metrics = view.getContext().getResources().getDisplayMetrics();
      int currentWidth = metrics.widthPixels;
      int currentHeight = metrics.heightPixels;

      if (lastWidth == currentWidth && lastHeight == currentHeight) {
        return;
      }
      lastWidth = currentWidth;
      lastHeight = currentHeight;

      notifyReplayIntegrationOfSizeChange(currentWidth, currentHeight);
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
      final ReplayController replayController =
          ScopesAdapter.getInstance().getOptions().getReplayController();

      if (replayController instanceof ReplayIntegration) {
        return (ReplayIntegration) replayController;
      } else {
        logger.log(SentryLevel.DEBUG, "Error getting replay integration");
      }
    } catch (Exception e) {
      logger.log(SentryLevel.DEBUG, "Error getting replay integration", e);
    }
    return null;
  }
}
