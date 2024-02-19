package io.sentry.react;

import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentManager.FragmentLifecycleCallbacks;
import android.os.Bundle;
import android.view.View;

import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;
import com.facebook.react.uimanager.events.EventDispatcherListener;

import com.swmansion.rnscreens.ScreenFragment;
import com.swmansion.rnscreens.events.ScreenAppearEvent;

import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.NotNull;

import io.sentry.ILogger;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;

public class RNSentryReactFragmentLifecycleTracer extends FragmentLifecycleCallbacks {

    private @NotNull final BuildInfoProvider buildInfoProvider;
    private @NotNull final Runnable emitNewFrameEvent;

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
        if (!(f instanceof ScreenFragment)) {
            return;
        }

        EventDispatcher eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(
            UIManagerHelper.getReactContext(((ScreenFragment) f).getScreen()),
            ((ScreenFragment) f).getScreen().getId());
        if (eventDispatcher == null) {
            return;
        }

        final @NotNull Runnable emitNewFrameEvent = this.emitNewFrameEvent;
        eventDispatcher.addListener(new EventDispatcherListener() {
            @Override
            public void onEventDispatch(Event event) {
                if (event instanceof ScreenAppearEvent) {
                    eventDispatcher.removeListener(this);
                    FirstDrawDoneListener
                            .registerForNextDraw(v, emitNewFrameEvent, buildInfoProvider);
                }
            }
        });
    }
}
