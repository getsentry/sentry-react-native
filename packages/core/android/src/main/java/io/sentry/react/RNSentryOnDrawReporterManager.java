package io.sentry.react;

import android.app.Activity;
import android.content.Context;
import android.view.View;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;
import io.sentry.ILogger;
import io.sentry.SentryDateProvider;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.SentryAndroidDateProvider;
import io.sentry.android.core.internal.util.FirstDrawDoneListener;
import io.sentry.react.utils.RNSentryActivityUtils;
import java.util.Objects;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.TestOnly;

public class RNSentryOnDrawReporterManager
    extends SimpleViewManager<RNSentryOnDrawReporterManager.RNSentryOnDrawReporterView> {

  public static final String REACT_CLASS = "RNSentryOnDrawReporter";
  public static final String TTID_PREFIX = "ttid-";
  public static final String TTFD_PREFIX = "ttfd-";
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
    private boolean spanIdUsed = false;
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

    @TestOnly
    public RNSentryOnDrawReporterView(
        @NotNull Context context,
        @NotNull ReactApplicationContext reactContext,
        @NotNull BuildInfoProvider buildInfoProvider) {
      super(context);
      this.reactContext = reactContext;
      buildInfo = buildInfoProvider;
    }

    public void setFullDisplay(boolean newIsFullDisplay) {
      if (newIsFullDisplay != isFullDisplay) {
        isFullDisplay = newIsFullDisplay;
        processPropsChanged();
      }
    }

    public void setInitialDisplay(boolean newIsInitialDisplay) {
      if (newIsInitialDisplay != isInitialDisplay) {
        isInitialDisplay = newIsInitialDisplay;
        processPropsChanged();
      }
    }

    public void setParentSpanId(@Nullable String newParentSpanId) {
      if (!Objects.equals(newParentSpanId, parentSpanId)) {
        parentSpanId = newParentSpanId;
        spanIdUsed = false;
        processPropsChanged();
      }
    }

    private void processPropsChanged() {
      if (parentSpanId == null) {
        return;
      }
      if (spanIdUsed) {
        logger.log(
            SentryLevel.DEBUG,
            "[TimeToDisplay] Already recorded time to display for spanId: " + parentSpanId);
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

      final @Nullable Activity activity =
          RNSentryActivityUtils.getCurrentActivity(reactContext, logger);
      if (activity == null) {
        logger.log(
            SentryLevel.ERROR,
            "[TimeToDisplay] Won't emit next frame drawn event, activity is null.");
        return;
      }

      spanIdUsed = true;
      registerForNextDraw(
          activity,
          () -> {
            final Double now = dateProvider.now().nanoTimestamp() / 1e9;
            if (parentSpanId == null) {
              logger.log(
                  SentryLevel.ERROR,
                  "[TimeToDisplay] parentSpanId removed before frame was rendered.");
              return;
            }

            if (isInitialDisplay) {
              RNSentryTimeToDisplay.putTimeToDisplayFor(TTID_PREFIX + parentSpanId, now);
            } else if (isFullDisplay) {
              RNSentryTimeToDisplay.putTimeToDisplayFor(TTFD_PREFIX + parentSpanId, now);
            } else {
              logger.log(
                  SentryLevel.DEBUG,
                  "[TimeToDisplay] display type removed before frame was rendered.");
            }
          },
          buildInfo);
    }

    protected void registerForNextDraw(
        final @NotNull Activity activity,
        final @NotNull Runnable callback,
        final @NotNull BuildInfoProvider buildInfo) {
      FirstDrawDoneListener.registerForNextDraw(activity, callback, buildInfo);
    }
  }
}
