package io.sentry.react;

import android.app.Activity;
import android.content.Context;
import android.view.View;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import io.sentry.ILogger;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.SentryAndroidDateProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class RNSentryOnDrawReporterManager
    extends SimpleViewManager<RNSentryOnDrawReporterManager.RNSentryOnDrawReporterView> {

  public static final String REACT_CLASS = "RNSentryOnDrawReporter";
  private final @NotNull ReactApplicationContext mCallerContext;

  public RNSentryOnDrawReporterManager(ReactApplicationContext reactContext) {
    mCallerContext = reactContext;
  }

  @NotNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NotNull
  @Override
  protected RNSentryOnDrawReporterView createViewInstance(
      @NotNull ThemedReactContext themedReactContext) {
    return new RNSentryOnDrawReporterView(
        mCallerContext, new BuildInfoProvider(new AndroidLogger()));
  }

  @ReactProp(name = "initialDisplay", defaultBoolean = false)
  public void setInitialDisplay(RNSentryOnDrawReporterView view, boolean initialDisplay) {
    view.setInitialDisplay(initialDisplay);
  }

  @ReactProp(name = "fullDisplay", defaultBoolean = false)
  public void setFullDisplay(RNSentryOnDrawReporterView view, boolean fullDisplay) {
    view.setFullDisplay(fullDisplay);
  }

  public Map getExportedCustomBubblingEventTypeConstants() {
    return MapBuilder.builder()
        .put(
            "onDrawNextFrameView",
            MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onDrawNextFrame")))
        .build();
  }

  public static class RNSentryOnDrawReporterView extends View {

    private static final ILogger logger = new AndroidLogger("RNSentryOnDrawReporterView");

    private final @Nullable ReactApplicationContext reactContext;
    private final @NotNull SentryDateProvider dateProvider = new SentryAndroidDateProvider();
    private final @Nullable Runnable emitInitialDisplayEvent;
    private final @Nullable Runnable emitFullDisplayEvent;
    private final @Nullable BuildInfoProvider buildInfo;

    public RNSentryOnDrawReporterView(@NotNull Context context) {
      super(context);
      reactContext = null;
      buildInfo = null;
      emitInitialDisplayEvent = null;
      emitFullDisplayEvent = null;
    }

    public RNSentryOnDrawReporterView(
        @NotNull ReactApplicationContext context, @NotNull BuildInfoProvider buildInfoProvider) {
      super(context);
      reactContext = context;
      buildInfo = buildInfoProvider;
      emitInitialDisplayEvent = () -> emitDisplayEvent("initialDisplay");
      emitFullDisplayEvent = () -> emitDisplayEvent("fullDisplay");
    }

    public void setFullDisplay(boolean fullDisplay) {
      if (!fullDisplay) {
        return;
      }

      logger.log(SentryLevel.DEBUG, "[TimeToDisplay] Register full display event emitter.");
      registerForNextDraw(emitFullDisplayEvent);
    }

    public void setInitialDisplay(boolean initialDisplay) {
      if (!initialDisplay) {
        return;
      }

      logger.log(SentryLevel.DEBUG, "[TimeToDisplay] Register initial display event emitter.");
      registerForNextDraw(emitInitialDisplayEvent);
    }

    private void registerForNextDraw(@Nullable Runnable emitter) {
      if (emitter == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Won't emit next frame drawn event, emitter is null.");
        return;
      }
      if (buildInfo == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Won't emit next frame drawn event, buildInfo is null.");
        return;
      }
      if (reactContext == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Won't emit next frame drawn event, reactContext is null.");
        return;
      }

      @Nullable Activity activity = reactContext.getCurrentActivity();
      if (activity == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Won't emit next frame drawn event, reactContext is null.");
        return;
      }

      FirstDrawDoneListener.registerForNextDraw(activity, emitter, buildInfo);
    }

    private void emitDisplayEvent(String type) {
      final SentryDate endDate = dateProvider.now();

      WritableMap event = Arguments.createMap();
      event.putString("type", type);
      event.putDouble("newFrameTimestampInSeconds", endDate.nanoTimestamp() / 1e9);

      if (reactContext == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Recorded next frame draw but can't emit the event, reactContext is"
                + " null.");
        return;
      }
      reactContext
          .getJSModule(RCTEventEmitter.class)
          .receiveEvent(getId(), "onDrawNextFrameView", event);
    }
  }
}
