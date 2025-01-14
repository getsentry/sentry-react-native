package io.sentry.react;

import android.app.Activity;
import android.content.Context;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.common.JavascriptException;
import io.sentry.ILogger;
import io.sentry.Integration;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.SentryReplayOptions;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.BuildConfig;
import io.sentry.android.core.CurrentActivityHolder;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.android.core.SentryAndroidOptions;
import io.sentry.protocol.SdkVersion;
import io.sentry.protocol.SentryPackage;
import io.sentry.react.replay.RNSentryReplayMask;
import io.sentry.react.replay.RNSentryReplayUnmask;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class RNSentryStart {

  public void startWithOptions(
      @NotNull final Context context,
      @NotNull final ReadableMap rnOptions,
      @Nullable Activity currentActivity,
      @NotNull ILogger logger) {
    SentryAndroid.init(
        context, options -> getSentryAndroidOptions(options, rnOptions, currentActivity, logger));
  }

  protected void getSentryAndroidOptions(
      @NotNull SentryAndroidOptions options,
      @NotNull ReadableMap rnOptions,
      @Nullable Activity currentActivity,
      ILogger logger) {
    @Nullable SdkVersion sdkVersion = options.getSdkVersion();
    if (sdkVersion == null) {
      sdkVersion = new SdkVersion(RNSentryVersion.ANDROID_SDK_NAME, BuildConfig.VERSION_NAME);
    } else {
      sdkVersion.setName(RNSentryVersion.ANDROID_SDK_NAME);
    }
    sdkVersion.addPackage(
        RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_NAME,
        RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_VERSION);

    options.setSentryClientName(sdkVersion.getName() + "/" + sdkVersion.getVersion());
    options.setNativeSdkName(RNSentryVersion.NATIVE_SDK_NAME);
    options.setSdkVersion(sdkVersion);

    if (rnOptions.hasKey("debug") && rnOptions.getBoolean("debug")) {
      options.setDebug(true);
    }
    if (rnOptions.hasKey("dsn") && rnOptions.getString("dsn") != null) {
      String dsn = rnOptions.getString("dsn");
      logger.log(SentryLevel.INFO, String.format("Starting with DSN: '%s'", dsn));
      options.setDsn(dsn);
    } else {
      // SentryAndroid needs an empty string fallback for the dsn.
      options.setDsn("");
    }
    if (rnOptions.hasKey("sampleRate")) {
      options.setSampleRate(rnOptions.getDouble("sampleRate"));
    }
    if (rnOptions.hasKey("sendClientReports")) {
      options.setSendClientReports(rnOptions.getBoolean("sendClientReports"));
    }
    if (rnOptions.hasKey("maxBreadcrumbs")) {
      options.setMaxBreadcrumbs(rnOptions.getInt("maxBreadcrumbs"));
    }
    if (rnOptions.hasKey("maxCacheItems")) {
      options.setMaxCacheItems(rnOptions.getInt("maxCacheItems"));
    }
    if (rnOptions.hasKey("environment") && rnOptions.getString("environment") != null) {
      options.setEnvironment(rnOptions.getString("environment"));
    }
    if (rnOptions.hasKey("release") && rnOptions.getString("release") != null) {
      options.setRelease(rnOptions.getString("release"));
    }
    if (rnOptions.hasKey("dist") && rnOptions.getString("dist") != null) {
      options.setDist(rnOptions.getString("dist"));
    }
    if (rnOptions.hasKey("enableAutoSessionTracking")) {
      options.setEnableAutoSessionTracking(rnOptions.getBoolean("enableAutoSessionTracking"));
    }
    if (rnOptions.hasKey("sessionTrackingIntervalMillis")) {
      options.setSessionTrackingIntervalMillis(rnOptions.getInt("sessionTrackingIntervalMillis"));
    }
    if (rnOptions.hasKey("shutdownTimeout")) {
      options.setShutdownTimeoutMillis(rnOptions.getInt("shutdownTimeout"));
    }
    if (rnOptions.hasKey("enableNdkScopeSync")) {
      options.setEnableScopeSync(rnOptions.getBoolean("enableNdkScopeSync"));
    }
    if (rnOptions.hasKey("attachStacktrace")) {
      options.setAttachStacktrace(rnOptions.getBoolean("attachStacktrace"));
    }
    if (rnOptions.hasKey("attachThreads")) {
      // JS use top level stacktrace and android attaches Threads which hides them so
      // by default we hide.
      options.setAttachThreads(rnOptions.getBoolean("attachThreads"));
    }
    if (rnOptions.hasKey("attachScreenshot")) {
      options.setAttachScreenshot(rnOptions.getBoolean("attachScreenshot"));
    }
    if (rnOptions.hasKey("attachViewHierarchy")) {
      options.setAttachViewHierarchy(rnOptions.getBoolean("attachViewHierarchy"));
    }
    if (rnOptions.hasKey("sendDefaultPii")) {
      options.setSendDefaultPii(rnOptions.getBoolean("sendDefaultPii"));
    }
    if (rnOptions.hasKey("maxQueueSize")) {
      options.setMaxQueueSize(rnOptions.getInt("maxQueueSize"));
    }
    if (rnOptions.hasKey("enableNdk")) {
      options.setEnableNdk(rnOptions.getBoolean("enableNdk"));
    }
    if (rnOptions.hasKey("spotlight")) {
      if (rnOptions.getType("spotlight") == ReadableType.Boolean) {
        options.setEnableSpotlight(rnOptions.getBoolean("spotlight"));
        options.setSpotlightConnectionUrl(rnOptions.getString("defaultSidecarUrl"));
      } else if (rnOptions.getType("spotlight") == ReadableType.String) {
        options.setEnableSpotlight(true);
        options.setSpotlightConnectionUrl(rnOptions.getString("spotlight"));
      }
    }

    SentryReplayOptions replayOptions = getReplayOptions(rnOptions);
    options.setSessionReplay(replayOptions);
    if (isReplayEnabled(replayOptions)) {
      options.getReplayController().setBreadcrumbConverter(new RNSentryReplayBreadcrumbConverter());
    }

    // Exclude Dev Server and Sentry Dsn request from Breadcrumbs
    String dsn = getURLFromDSN(rnOptions.getString("dsn"));
    String devServerUrl = rnOptions.getString("devServerUrl");
    options.setBeforeBreadcrumb(
        (breadcrumb, hint) -> {
          Object urlObject = breadcrumb.getData("url");
          String url = urlObject instanceof String ? (String) urlObject : "";
          if ("http".equals(breadcrumb.getType())
              && ((dsn != null && url.startsWith(dsn))
                  || (devServerUrl != null && url.startsWith(devServerUrl)))) {
            return null;
          }
          return breadcrumb;
        });

    // React native internally throws a JavascriptException.
    // we want to ignore it on the native side to avoid sending it twice.
    options.addIgnoredExceptionForType(JavascriptException.class);

    options.setBeforeSend(
        (event, hint) -> {
          setEventOriginTag(event);
          addPackages(event, options.getSdkVersion());

          return event;
        });

    if (rnOptions.hasKey("enableNativeCrashHandling")
        && !rnOptions.getBoolean("enableNativeCrashHandling")) {
      final List<Integration> integrations = options.getIntegrations();
      for (final Integration integration : integrations) {
        if (integration instanceof UncaughtExceptionHandlerIntegration
            || integration instanceof AnrIntegration
            || integration instanceof NdkIntegration) {
          integrations.remove(integration);
        }
      }
    }
    logger.log(
        SentryLevel.INFO, String.format("Native Integrations '%s'", options.getIntegrations()));

    setCurrentActivity(currentActivity);
  }

  private void setCurrentActivity(Activity currentActivity) {
    final CurrentActivityHolder currentActivityHolder = CurrentActivityHolder.getInstance();
    if (currentActivity != null) {
      currentActivityHolder.setActivity(currentActivity);
    }
  }

  private boolean isReplayEnabled(SentryReplayOptions replayOptions) {
    return replayOptions.getSessionSampleRate() != null
        || replayOptions.getOnErrorSampleRate() != null;
  }

  private SentryReplayOptions getReplayOptions(@NotNull ReadableMap rnOptions) {
    final SdkVersion replaySdkVersion =
        new SdkVersion(
            RNSentryVersion.REACT_NATIVE_SDK_NAME,
            RNSentryVersion.REACT_NATIVE_SDK_PACKAGE_VERSION);
    @NotNull
    final SentryReplayOptions androidReplayOptions =
        new SentryReplayOptions(false, replaySdkVersion);

    if (!(rnOptions.hasKey("replaysSessionSampleRate")
        || rnOptions.hasKey("replaysOnErrorSampleRate"))) {
      return androidReplayOptions;
    }

    androidReplayOptions.setSessionSampleRate(
        rnOptions.hasKey("replaysSessionSampleRate")
            ? rnOptions.getDouble("replaysSessionSampleRate")
            : null);
    androidReplayOptions.setOnErrorSampleRate(
        rnOptions.hasKey("replaysOnErrorSampleRate")
            ? rnOptions.getDouble("replaysOnErrorSampleRate")
            : null);

    if (!rnOptions.hasKey("mobileReplayOptions")) {
      return androidReplayOptions;
    }
    @Nullable final ReadableMap rnMobileReplayOptions = rnOptions.getMap("mobileReplayOptions");
    if (rnMobileReplayOptions == null) {
      return androidReplayOptions;
    }

    androidReplayOptions.setMaskAllText(
        !rnMobileReplayOptions.hasKey("maskAllText")
            || rnMobileReplayOptions.getBoolean("maskAllText"));
    androidReplayOptions.setMaskAllImages(
        !rnMobileReplayOptions.hasKey("maskAllImages")
            || rnMobileReplayOptions.getBoolean("maskAllImages"));

    final boolean redactVectors =
        !rnMobileReplayOptions.hasKey("maskAllVectors")
            || rnMobileReplayOptions.getBoolean("maskAllVectors");
    if (redactVectors) {
      androidReplayOptions.addMaskViewClass("com.horcrux.svg.SvgView"); // react-native-svg
    }

    androidReplayOptions.setMaskViewContainerClass(RNSentryReplayMask.class.getName());
    androidReplayOptions.setUnmaskViewContainerClass(RNSentryReplayUnmask.class.getName());

    return androidReplayOptions;
  }

  private void setEventOriginTag(SentryEvent event) {
    // We hardcode native-java as only java events are processed by the Android SDK.
    SdkVersion sdk = event.getSdk();
    if (sdk != null) {
      switch (sdk.getName()) {
        case RNSentryVersion.NATIVE_SDK_NAME:
          setEventEnvironmentTag(event, "native");
          break;
        case RNSentryVersion.ANDROID_SDK_NAME:
          setEventEnvironmentTag(event, "java");
          break;
        default:
          break;
      }
    }
  }

  private void setEventEnvironmentTag(SentryEvent event, String environment) {
    event.setTag("event.origin", "android");
    event.setTag("event.environment", environment);
  }

  private void addPackages(SentryEvent event, SdkVersion sdk) {
    SdkVersion eventSdk = event.getSdk();
    if (eventSdk != null
        && "sentry.javascript.react-native".equals(eventSdk.getName())
        && sdk != null) {
      List<SentryPackage> sentryPackages = sdk.getPackages();
      if (sentryPackages != null) {
        for (SentryPackage sentryPackage : sentryPackages) {
          eventSdk.addPackage(sentryPackage.getName(), sentryPackage.getVersion());
        }
      }

      List<String> integrations = sdk.getIntegrations();
      if (integrations != null) {
        for (String integration : integrations) {
          eventSdk.addIntegration(integration);
        }
      }

      event.setSdk(eventSdk);
    }
  }

  private static @Nullable String getURLFromDSN(@Nullable String dsn) {
    if (dsn == null) {
      return null;
    }
    URI uri = null;
    try {
      uri = new URI(dsn);
    } catch (URISyntaxException e) {
      return null;
    }
    return uri.getScheme() + "://" + uri.getHost();
  }
}
