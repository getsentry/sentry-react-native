package io.sentry.react;

import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.EventDispatcherListener;


import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.NotNull;

import io.sentry.ILogger;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;

public class RNSentryReactFragmentLifecycleTracer extends FragmentLifecycleCallbacks {

    private @NotNull
    final BuildInfoProvider buildInfoProvider;
    private @NotNull
    final Runnable emitNewFrameEvent;

    private static final ILogger logger = new AndroidLogger("SentryReactFragmentLifecycleTracer");

    public RNSentryReactFragmentLifecycleTracer(
            @NotNull BuildInfoProvider buildInfoProvider,
            @NotNull Runnable emitNewFrameEvent
    ) {
        this.buildInfoProvider = buildInfoProvider;
        this.emitNewFrameEvent = emitNewFrameEvent;
    }

    @Override
    public void onFragmentViewCreated(
            @NotNull FragmentManager fm,
            @NotNull Fragment f,
            @NotNull View v,
            @Nullable Bundle savedInstanceState) {
        if (!("com.swmansion.rnscreens.ScreenStackFragment".equals(f.getClass().getCanonicalName()))) {
            return;
        }

        if (!(v instanceof ViewGroup)) {
            return;
        }

        final ViewGroup viewGroup = (ViewGroup) v;
        if (viewGroup.getChildCount() == 0) {
            return;
        }

        final @Nullable View screen = viewGroup.getChildAt(0);
        if (screen == null || !(screen.getContext() instanceof ReactContext)) {
            return;
        }

        final int screenId = screen.getId();
        if (screenId == View.NO_ID) {
            return;
        }

        EventDispatcher eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(
                UIManagerHelper.getReactContext(v),
                screenId);
        if (eventDispatcher == null) {
            return;
        }

        final @NotNull Runnable emitNewFrameEvent = this.emitNewFrameEvent;
        eventDispatcher.addListener(new EventDispatcherListener() {
            @Override
            public void onEventDispatch(Event event) {
                if ("com.swmansion.rnscreens.events.ScreenAppearEvent".equals(event.getClass().getCanonicalName())) {
                    eventDispatcher.removeListener(this);
                    FirstDrawDoneListener
                            .registerForNextDraw(v, emitNewFrameEvent, buildInfoProvider);
                }
            }
        });
    }
}
