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

  @ReactProp(name = "parentSpanId")
  public void setParentSpanId(RNSentryOnDrawReporterView view, String parentSpanId) {
    view.setParentSpanId(parentSpanId);
  }

  public static class RNSentryOnDrawReporterView extends View {

    private static final ILogger logger = new AndroidLogger("RNSentryOnDrawReporterView");

    private final @Nullable ReactApplicationContext reactContext;
    private final @NotNull SentryDateProvider dateProvider = new SentryAndroidDateProvider();
    private final @Nullable BuildInfoProvider buildInfo;

    private boolean isInitialDisplay = false;
    private boolean isFullDisplay = false;
    private @Nullable String parentSpanId = null;

    public RNSentryOnDrawReporterView(@NotNull Context context) {
      super(context);
      reactContext = null;
      buildInfo = null;
    }

    public RNSentryOnDrawReporterView(
        @NotNull ReactApplicationContext context, @NotNull BuildInfoProvider buildInfoProvider) {
      super(context);
      reactContext = context;
      buildInfo = buildInfoProvider;
    }

    public void setFullDisplay(boolean fullDisplay) {
      isFullDisplay = fullDisplay;
      registerForNextDraw();
    }

    public void setInitialDisplay(boolean initialDisplay) {
      isInitialDisplay = initialDisplay;
      registerForNextDraw();
    }

    public void setParentSpanId(@Nullable String parentSpanId) {
      this.parentSpanId = parentSpanId;
      registerForNextDraw();
    }

    private void registerForNextDraw() {
      if (parentSpanId == null) {
        return;
      }

      if (isInitialDisplay) {
        logger.log(SentryLevel.DEBUG, "[TimeToDisplay] Register initial display event emitter.");
      } else if (isFullDisplay) {
        logger.log(SentryLevel.DEBUG, "[TimeToDisplay] Register full display event emitter.");
      } else {
        logger.log(SentryLevel.DEBUG, "[TimeToDisplay] Not ready, missing displayType prop.");
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

      FirstDrawDoneListener.registerForNextDraw(activity, () -> {
        final Double now = dateProvider.now().nanoTimestamp() / 1e9;
        if (parentSpanId == null) {
          logger.log(
                  SentryLevel.ERROR,
                  "[TimeToDisplay] parentSpanId removed before frame was rendered.");
          return;
        }

        if (isInitialDisplay) {
          RNSentryTimeToDisplay.putTimeToDisplayFor("ttid-" + parentSpanId, now);
        } else if (isFullDisplay) {
          RNSentryTimeToDisplay.putTimeToDisplayFor("ttfd-" + parentSpanId, now);
        } else {
          logger.log(SentryLevel.DEBUG, "[TimeToDisplay] display type removed before frame was rendered.");
        }
      }, buildInfo);
    }
  }
}
