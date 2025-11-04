package io.sentry.react;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
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
import io.sentry.SentryLevel;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class RNSentryReactFragmentLifecycleTracer extends FragmentLifecycleCallbacks {

  private @NotNull final BuildInfoProvider buildInfoProvider;
  private @NotNull final Runnable emitNewFrameEvent;
  private @NotNull final ILogger logger;

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
  }

  private static @Nullable EventDispatcher getEventDispatcherForReactTag(
      @NonNull View screen, int screenId) {
    return UIManagerHelper.getEventDispatcherForReactTag(
        UIManagerHelper.getReactContext(screen), screenId);
  }
}
