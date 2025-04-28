package io.sentry.react;

import static io.sentry.android.core.internal.util.ScreenshotUtils.takeScreenshot;
import static io.sentry.vendor.Base64.NO_PADDING;
import static io.sentry.vendor.Base64.NO_WRAP;
import static java.util.concurrent.TimeUnit.SECONDS;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.net.Uri;
import android.util.SparseIntArray;
import androidx.annotation.VisibleForTesting;
import androidx.core.app.FrameMetricsAggregator;
import androidx.fragment.app.FragmentActivity;
import androidx.fragment.app.FragmentManager;
import com.facebook.hermes.instrumentation.HermesSamplingProfiler;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;
import com.facebook.react.common.JavascriptException;
import io.sentry.Breadcrumb;
import io.sentry.HubAdapter;
import io.sentry.ILogger;
import io.sentry.IScope;
import io.sentry.ISentryExecutorService;
import io.sentry.ISerializer;
import io.sentry.Integration;
import io.sentry.Sentry;
import io.sentry.SentryDate;
import io.sentry.SentryDateProvider;
import io.sentry.SentryEvent;
import io.sentry.SentryExecutorService;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.SentryReplayOptions;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.AndroidProfiler;
import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.BuildConfig;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.CurrentActivityHolder;
import io.sentry.android.core.InternalSentrySdk;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.android.core.SentryAndroidDateProvider;
import io.sentry.android.core.SentryAndroidOptions;
import io.sentry.android.core.ViewHierarchyEventProcessor;
import io.sentry.android.core.internal.debugmeta.AssetsDebugMetaLoader;
import io.sentry.android.core.internal.util.SentryFrameMetricsCollector;
import io.sentry.android.core.performance.AppStartMetrics;
import io.sentry.protocol.SdkVersion;
import io.sentry.protocol.SentryId;
import io.sentry.protocol.SentryPackage;
import io.sentry.protocol.User;
import io.sentry.protocol.ViewHierarchy;
import io.sentry.react.replay.RNSentryReplayMask;
import io.sentry.react.replay.RNSentryReplayUnmask;
import io.sentry.util.DebugMetaPropertiesApplier;
import io.sentry.util.FileUtils;
import io.sentry.util.JsonSerializationUtils;
import io.sentry.vendor.Base64;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.CountDownLatch;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.TestOnly;

public class RNSentryModuleImpl {

  public static final String NAME = "RNSentry";

  private static final ILogger logger = new AndroidLogger(NAME);
  private static final BuildInfoProvider buildInfo = new BuildInfoProvider(logger);
  private static final String modulesPath = "modules.json";
  private static final Charset UTF_8 = Charset.forName("UTF-8"); // NOPMD - Allow using UTF-8

  private final ReactApplicationContext reactApplicationContext;
  private final PackageInfo packageInfo;
  private FrameMetricsAggregator frameMetricsAggregator = null;
  private boolean androidXAvailable;

  @VisibleForTesting static long lastStartTimestampMs = -1;

  // 700ms to constitute frozen frames.
  private static final int FROZEN_FRAME_THRESHOLD = 700;
  // 16ms (slower than 60fps) to constitute slow frames.
  private static final int SLOW_FRAME_THRESHOLD = 16;

  private static final int SCREENSHOT_TIMEOUT_SECONDS = 2;

  /**
   * Profiling traces rate. 101 hz means 101 traces in 1 second. Defaults to 101 to avoid possible
   * lockstep sampling. More on
   * https://stackoverflow.com/questions/45470758/what-is-lockstep-sampling
   */
  private int profilingTracesHz = 101;

  private AndroidProfiler androidProfiler = null;

  private boolean isProguardDebugMetaLoaded = false;
  private @Nullable String proguardUuid = null;
  private String cacheDirPath = null;
  private ISentryExecutorService executorService = null;

  private final @NotNull Runnable emitNewFrameEvent;

  /** Max trace file size in bytes. */
  private long maxTraceFileSize = 5 * 1024 * 1024;

  private final @NotNull SentryDateProvider dateProvider;

  public RNSentryModuleImpl(ReactApplicationContext reactApplicationContext) {
    packageInfo = getPackageInfo(reactApplicationContext);
    this.reactApplicationContext = reactApplicationContext;
    this.emitNewFrameEvent = createEmitNewFrameEvent();
    this.dateProvider = new SentryAndroidDateProvider();
  }

  private ReactApplicationContext getReactApplicationContext() {
    return this.reactApplicationContext;
  }

  private @Nullable Activity getCurrentActivity() {
    return this.reactApplicationContext.getCurrentActivity();
  }

  private @NotNull Runnable createEmitNewFrameEvent() {
    return () -> {
      final SentryDate endDate = dateProvider.now();
      RNSentryTimeToDisplay.putTimeToInitialDisplayForActiveSpan(endDate.nanoTimestamp() / 1e9);
    };
  }

  private void initFragmentInitialFrameTracking() {
    final RNSentryReactFragmentLifecycleTracer fragmentLifecycleTracer =
        new RNSentryReactFragmentLifecycleTracer(buildInfo, emitNewFrameEvent, logger);

    final @Nullable FragmentActivity fragmentActivity = (FragmentActivity) getCurrentActivity();
    if (fragmentActivity != null) {
      final @Nullable FragmentManager supportFragmentManager =
          fragmentActivity.getSupportFragmentManager();
      if (supportFragmentManager != null) {
        supportFragmentManager.registerFragmentLifecycleCallbacks(fragmentLifecycleTracer, true);
      }
    }
  }

  public void initNativeReactNavigationNewFrameTracking(Promise promise) {
    this.initFragmentInitialFrameTracking();
  }

  public void initNativeSdk(final ReadableMap rnOptions, Promise promise) {
    SentryAndroid.init(
        getApplicationContext(), options -> getSentryAndroidOptions(options, rnOptions, logger));

    promise.resolve(true);
  }

  @TestOnly
  protected Context getApplicationContext() {
    final Context context = this.getReactApplicationContext().getApplicationContext();
    if (context == null) {
      logger.log(
          SentryLevel.ERROR, "ApplicationContext is null, using ReactApplicationContext fallback.");
      return this.getReactApplicationContext();
    }
    return context;
  }

  protected void getSentryAndroidOptions(
      @NotNull SentryAndroidOptions options, @NotNull ReadableMap rnOptions, ILogger logger) {
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

    final CurrentActivityHolder currentActivityHolder = CurrentActivityHolder.getInstance();
    final Activity currentActivity = getCurrentActivity();
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

  public void crash() {
    throw new RuntimeException("TEST - Sentry Client Crash (only works in release mode)");
  }

  public void addListener(String eventType) {
    // Is must be defined otherwise the generated interface from TS won't be fulfilled
    logger.log(SentryLevel.ERROR, "addListener of NativeEventEmitter can't be used on Android!");
  }

  public void removeListeners(double id) {
    // Is must be defined otherwise the generated interface from TS won't be fulfilled
    logger.log(
        SentryLevel.ERROR, "removeListeners of NativeEventEmitter can't be used on Android!");
  }

  public void fetchModules(Promise promise) {
    final AssetManager assets = this.getReactApplicationContext().getResources().getAssets();
    try (InputStream stream = new BufferedInputStream(assets.open(modulesPath))) {
      int size = stream.available();
      byte[] buffer = new byte[size];
      stream.read(buffer);
      stream.close();
      String modulesJson = new String(buffer, UTF_8);
      promise.resolve(modulesJson);
    } catch (FileNotFoundException e) {
      promise.resolve(null);
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      logger.log(SentryLevel.WARNING, "Fetching JS Modules failed.");
      promise.resolve(null);
    }
  }

  public void fetchNativeRelease(Promise promise) {
    WritableMap release = Arguments.createMap();
    release.putString("id", packageInfo.packageName);
    release.putString("version", packageInfo.versionName);
    release.putString("build", String.valueOf(packageInfo.versionCode));
    promise.resolve(release);
  }

  public void fetchNativeAppStart(Promise promise) {
    fetchNativeAppStart(
        promise, AppStartMetrics.getInstance(), InternalSentrySdk.getAppStartMeasurement(), logger);
  }

  protected void fetchNativeAppStart(
      Promise promise,
      final AppStartMetrics metrics,
      final Map<String, Object> metricsDataBag,
      ILogger logger) {
    if (!metrics.isAppLaunchedInForeground()) {
      logger.log(SentryLevel.WARNING, "Invalid app start data: app not launched in foreground.");
      promise.resolve(null);
      return;
    }

    WritableMap mutableMeasurement =
        (WritableMap) RNSentryMapConverter.convertToWritable(metricsDataBag);

    long currentStartTimestampMs = metrics.getAppStartTimeSpan().getStartTimestampMs();
    boolean hasFetched =
        lastStartTimestampMs > 0 && lastStartTimestampMs == currentStartTimestampMs;
    mutableMeasurement.putBoolean("has_fetched", hasFetched);

    if (lastStartTimestampMs < 0) {
      logger.log(SentryLevel.DEBUG, "App Start data reported to the RN layer for the first time.");
    } else if (hasFetched) {
      logger.log(SentryLevel.DEBUG, "App Start data already fetched from native before.");
    } else {
      logger.log(SentryLevel.DEBUG, "App Start data updated, reporting to the RN layer again.");
    }

    // When activity is destroyed but the application process is kept alive
    // the next activity creation is considered warm start.
    // The app start metrics will be updated by the the Android SDK.
    // To let the RN JS layer know these are new start data we compare the start timestamps.
    lastStartTimestampMs = currentStartTimestampMs;

    // Clears start metrics, making them ready for recording warm app start
    metrics.onAppStartSpansSent();

    promise.resolve(mutableMeasurement);
  }

  /** Returns frames metrics at the current point in time. */
  public void fetchNativeFrames(Promise promise) {
    if (!isFrameMetricsAggregatorAvailable()) {
      promise.resolve(null);
    } else {
      try {
        int totalFrames = 0;
        int slowFrames = 0;
        int frozenFrames = 0;

        final SparseIntArray[] framesRates = frameMetricsAggregator.getMetrics();

        if (framesRates != null) {
          final SparseIntArray totalIndexArray = framesRates[FrameMetricsAggregator.TOTAL_INDEX];
          if (totalIndexArray != null) {
            for (int i = 0; i < totalIndexArray.size(); i++) {
              int frameTime = totalIndexArray.keyAt(i);
              int numFrames = totalIndexArray.valueAt(i);
              totalFrames += numFrames;
              // hard coded values, its also in the official android docs and frame metrics
              // API
              if (frameTime > FROZEN_FRAME_THRESHOLD) {
                // frozen frames, threshold is 700ms
                frozenFrames += numFrames;
              } else if (frameTime > SLOW_FRAME_THRESHOLD) {
                // slow frames, above 16ms, 60 frames/second
                slowFrames += numFrames;
              }
            }
          }
        }

        WritableMap map = Arguments.createMap();
        map.putInt("totalFrames", totalFrames);
        map.putInt("slowFrames", slowFrames);
        map.putInt("frozenFrames", frozenFrames);

        promise.resolve(map);
      } catch (Throwable ignored) { // NOPMD - We don't want to crash in any case
        logger.log(SentryLevel.WARNING, "Error fetching native frames.");
        promise.resolve(null);
      }
    }
  }

  public void captureReplay(boolean isHardCrash, Promise promise) {
    Sentry.getCurrentHub().getOptions().getReplayController().captureReplay(isHardCrash);
    promise.resolve(getCurrentReplayId());
  }

  public @Nullable String getCurrentReplayId() {
    final @Nullable IScope scope = InternalSentrySdk.getCurrentScope();
    if (scope == null) {
      return null;
    }

    final @NotNull SentryId id = scope.getReplayId();
    if (id == SentryId.EMPTY_ID) {
      return null;
    }
    return id.toString();
  }

  public void captureEnvelope(String rawBytes, ReadableMap options, Promise promise) {
    byte[] bytes = Base64.decode(rawBytes, Base64.DEFAULT);

    try {
      InternalSentrySdk.captureEnvelope(
          bytes, !options.hasKey("hardCrashed") || !options.getBoolean("hardCrashed"));
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      logger.log(SentryLevel.ERROR, "Error while capturing envelope");
      promise.resolve(false);
    }
    promise.resolve(true);
  }

  public void captureScreenshot(Promise promise) {

    final Activity activity = getCurrentActivity();
    if (activity == null) {
      logger.log(SentryLevel.WARNING, "CurrentActivity is null, can't capture screenshot.");
      promise.resolve(null);
      return;
    }

    final byte[] raw = takeScreenshotOnUiThread(activity);

    if (raw == null || raw.length == 0) {
      logger.log(SentryLevel.WARNING, "Screenshot is null, screen was not captured.");
      promise.resolve(null);
      return;
    }

    final WritableNativeArray data = new WritableNativeArray();
    for (final byte b : raw) {
      data.pushInt(b);
    }
    final WritableMap screenshot = new WritableNativeMap();
    screenshot.putString("contentType", "image/png");
    screenshot.putArray("data", data);
    screenshot.putString("filename", "screenshot.png");

    final WritableArray screenshotsArray = new WritableNativeArray();
    screenshotsArray.pushMap(screenshot);
    promise.resolve(screenshotsArray);
  }

  private static byte[] takeScreenshotOnUiThread(Activity activity) {
    CountDownLatch doneSignal = new CountDownLatch(1);
    final byte[][] bytesWrapper = {{}}; // wrapper to be able to set the value in the runnable
    final Runnable runTakeScreenshot =
        () -> {
          bytesWrapper[0] = takeScreenshot(activity, logger, buildInfo);
          doneSignal.countDown();
        };

    if (UiThreadUtil.isOnUiThread()) {
      runTakeScreenshot.run();
    } else {
      UiThreadUtil.runOnUiThread(runTakeScreenshot);
    }

    try {
      doneSignal.await(SCREENSHOT_TIMEOUT_SECONDS, SECONDS);
    } catch (InterruptedException e) {
      logger.log(SentryLevel.ERROR, "Screenshot process was interrupted.");
      return new byte[0];
    }

    return bytesWrapper[0];
  }

  public void fetchViewHierarchy(Promise promise) {
    final @Nullable Activity activity = getCurrentActivity();
    final @Nullable ViewHierarchy viewHierarchy =
        ViewHierarchyEventProcessor.snapshotViewHierarchy(activity, logger);
    if (viewHierarchy == null) {
      logger.log(SentryLevel.ERROR, "Could not get ViewHierarchy.");
      promise.resolve(null);
      return;
    }

    ISerializer serializer = HubAdapter.getInstance().getOptions().getSerializer();
    final @Nullable byte[] bytes =
        JsonSerializationUtils.bytesFrom(serializer, logger, viewHierarchy);
    if (bytes == null) {
      logger.log(SentryLevel.ERROR, "Could not serialize ViewHierarchy.");
      promise.resolve(null);
      return;
    }
    if (bytes.length < 1) {
      logger.log(SentryLevel.ERROR, "Got empty bytes array after serializing ViewHierarchy.");
      promise.resolve(null);
      return;
    }

    final WritableNativeArray data = new WritableNativeArray();
    for (final byte b : bytes) {
      data.pushInt(b);
    }
    promise.resolve(data);
  }

  private static PackageInfo getPackageInfo(Context ctx) {
    try {
      return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
    } catch (PackageManager.NameNotFoundException e) {
      logger.log(SentryLevel.WARNING, "Error getting package info.");
      return null;
    }
  }

  public void setUser(final ReadableMap userKeys, final ReadableMap userDataKeys) {
    Sentry.configureScope(
        scope -> {
          if (userKeys == null && userDataKeys == null) {
            scope.setUser(null);
          } else {
            User userInstance = new User();

            if (userKeys != null) {
              if (userKeys.hasKey("email")) {
                userInstance.setEmail(userKeys.getString("email"));
              }

              if (userKeys.hasKey("id")) {
                userInstance.setId(userKeys.getString("id"));
              }

              if (userKeys.hasKey("username")) {
                userInstance.setUsername(userKeys.getString("username"));
              }

              if (userKeys.hasKey("ip_address")) {
                userInstance.setIpAddress(userKeys.getString("ip_address"));
              }

              if (userKeys.hasKey("segment")) {
                userInstance.setSegment(userKeys.getString("segment"));
              }
            }

            if (userDataKeys != null) {
              Map<String, String> userDataMap = new HashMap<>();
              ReadableMapKeySetIterator it = userDataKeys.keySetIterator();
              while (it.hasNextKey()) {
                String key = it.nextKey();
                String value = userDataKeys.getString(key);

                // other is ConcurrentHashMap and can't have null values
                if (value != null) {
                  userDataMap.put(key, value);
                }
              }

              userInstance.setData(userDataMap);
            }

            scope.setUser(userInstance);
          }
        });
  }

  public void addBreadcrumb(final ReadableMap breadcrumb) {
    Sentry.configureScope(
        scope -> {
          scope.addBreadcrumb(RNSentryBreadcrumb.fromMap(breadcrumb));

          final @Nullable String screen = RNSentryBreadcrumb.getCurrentScreenFrom(breadcrumb);
          if (screen != null) {
            scope.setScreen(screen);
          }
        });
  }

  public void clearBreadcrumbs() {
    Sentry.configureScope(
        scope -> {
          scope.clearBreadcrumbs();
        });
  }

  public void popTimeToDisplayFor(String screenId, Promise promise) {
    if (screenId != null) {
      promise.resolve(RNSentryTimeToDisplay.popTimeToDisplayFor(screenId));
    } else {
      promise.resolve(null);
    }
  }

  public boolean setActiveSpanId(@Nullable String spanId) {
    RNSentryTimeToDisplay.setActiveSpanId(spanId);
    return true; // The return ensure RN executes the code synchronously
  }

  public void setExtra(String key, String extra) {
    if (key == null || extra == null) {
      logger.log(
          SentryLevel.ERROR,
          "RNSentry.setExtra called with null key or value, can't change extra.");
      return;
    }

    Sentry.configureScope(
        scope -> {
          scope.setExtra(key, extra);
        });
  }

  public void setContext(final String key, final ReadableMap context) {
    if (key == null) {
      logger.log(
          SentryLevel.ERROR, "RNSentry.setContext called with null key, can't change context.");
      return;
    }

    Sentry.configureScope(
        scope -> {
          if (context == null) {
            scope.removeContexts(key);
            return;
          }

          final Map<String, Object> contextHashMap = context.toHashMap();
          scope.setContexts(key, contextHashMap);
        });
  }

  public void setTag(String key, String value) {
    Sentry.configureScope(
        scope -> {
          scope.setTag(key, value);
        });
  }

  public void closeNativeSdk(Promise promise) {
    Sentry.close();

    disableNativeFramesTracking();

    promise.resolve(true);
  }

  public void enableNativeFramesTracking() {
    androidXAvailable = checkAndroidXAvailability();

    if (androidXAvailable) {
      frameMetricsAggregator = new FrameMetricsAggregator();
      final Activity currentActivity = getCurrentActivity();

      if (frameMetricsAggregator != null && currentActivity != null) {
        try {
          frameMetricsAggregator.add(currentActivity);

          logger.log(SentryLevel.INFO, "FrameMetricsAggregator installed.");
        } catch (Throwable ignored) { // NOPMD - We don't want to crash in any case
          // throws ConcurrentModification when calling addOnFrameMetricsAvailableListener
          // this is a best effort since we can't reproduce it
          logger.log(SentryLevel.ERROR, "Error adding Activity to frameMetricsAggregator.");
        }
      } else {
        logger.log(SentryLevel.INFO, "currentActivity isn't available.");
      }
    } else {
      logger.log(SentryLevel.WARNING, "androidx.core' isn't available as a dependency.");
    }
  }

  public void disableNativeFramesTracking() {
    if (isFrameMetricsAggregatorAvailable()) {
      frameMetricsAggregator.stop();
      frameMetricsAggregator = null;
    }
  }

  public void getNewScreenTimeToDisplay(Promise promise) {
    RNSentryTimeToDisplay.getTimeToDisplay(promise, dateProvider);
  }

  private String getProfilingTracesDirPath() {
    if (cacheDirPath == null) {
      cacheDirPath =
          new File(getReactApplicationContext().getCacheDir(), "sentry/react").getAbsolutePath();
    }
    File profilingTraceDir = new File(cacheDirPath, "profiling_trace");
    profilingTraceDir.mkdirs();
    return profilingTraceDir.getAbsolutePath();
  }

  private void initializeAndroidProfiler() {
    if (executorService == null) {
      executorService = new SentryExecutorService();
    }
    final String tracesFilesDirPath = getProfilingTracesDirPath();

    androidProfiler =
        new AndroidProfiler(
            tracesFilesDirPath,
            (int) SECONDS.toMicros(1) / profilingTracesHz,
            new SentryFrameMetricsCollector(reactApplicationContext, logger, buildInfo),
            executorService,
            logger,
            buildInfo);
  }

  public WritableMap startProfiling(boolean platformProfilers) {
    final WritableMap result = new WritableNativeMap();
    if (androidProfiler == null && platformProfilers) {
      initializeAndroidProfiler();
    }

    try {
      HermesSamplingProfiler.enable();
      if (androidProfiler != null) {
        androidProfiler.start();
      }

      result.putBoolean("started", true);
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      result.putBoolean("started", false);
      result.putString("error", e.toString());
    }
    return result;
  }

  public WritableMap stopProfiling() {
    final boolean isDebug = HubAdapter.getInstance().getOptions().isDebug();
    final WritableMap result = new WritableNativeMap();
    File output = null;
    try {
      AndroidProfiler.ProfileEndData end = null;
      if (androidProfiler != null) {
        end = androidProfiler.endAndCollect(false, null);
      }
      HermesSamplingProfiler.disable();

      output =
          File.createTempFile(
              "sampling-profiler-trace", ".cpuprofile", reactApplicationContext.getCacheDir());
      if (isDebug) {
        logger.log(SentryLevel.INFO, "Profile saved to: " + output.getAbsolutePath());
      }

      HermesSamplingProfiler.dumpSampledTraceToFile(output.getPath());
      result.putString("profile", readStringFromFile(output));

      if (end != null) {
        WritableMap androidProfile = new WritableNativeMap();
        byte[] androidProfileBytes =
            FileUtils.readBytesFromFile(end.traceFile.getPath(), maxTraceFileSize);
        String base64AndroidProfile =
            Base64.encodeToString(androidProfileBytes, NO_WRAP | NO_PADDING);

        androidProfile.putString("sampled_profile", base64AndroidProfile);
        androidProfile.putInt("android_api_level", buildInfo.getSdkInfoVersion());
        androidProfile.putString("build_id", getProguardUuid());
        result.putMap("androidProfile", androidProfile);
      }
    } catch (Throwable e) { // NOPMD - We don't want to crash in any case
      result.putString("error", e.toString());
    } finally {
      if (output != null) {
        try {
          final boolean wasProfileSuccessfullyDeleted = output.delete();
          if (!wasProfileSuccessfullyDeleted) {
            logger.log(SentryLevel.WARNING, "Profile not deleted from:" + output.getAbsolutePath());
          }
        } catch (Throwable e) { // NOPMD - We don't want to crash in any case
          logger.log(SentryLevel.WARNING, "Profile not deleted from:" + output.getAbsolutePath());
        }
      }
    }
    return result;
  }

  private @Nullable String getProguardUuid() {
    if (isProguardDebugMetaLoaded) {
      return proguardUuid;
    }
    isProguardDebugMetaLoaded = true;
    final @Nullable List<Properties> debugMetaList =
        new AssetsDebugMetaLoader(this.getReactApplicationContext(), logger).loadDebugMeta();
    if (debugMetaList == null) {
      return null;
    }

    for (Properties debugMeta : debugMetaList) {
      proguardUuid = DebugMetaPropertiesApplier.getProguardUuid(debugMeta);
      if (proguardUuid != null) {
        logger.log(SentryLevel.INFO, "Proguard uuid found: " + proguardUuid);
        return proguardUuid;
      }
    }

    logger.log(SentryLevel.WARNING, "No proguard uuid found in debug meta properties file!");
    return null;
  }

  private String readStringFromFile(File path) throws IOException {
    try (BufferedReader br = new BufferedReader(new FileReader(path)); ) {

      final StringBuilder text = new StringBuilder();
      String line;
      while ((line = br.readLine()) != null) {
        text.append(line);
        text.append('\n');
      }
      return text.toString();
    }
  }

  public void fetchNativeDeviceContexts(Promise promise) {
    final @NotNull SentryOptions options = HubAdapter.getInstance().getOptions();
    final @Nullable Context context = this.getReactApplicationContext().getApplicationContext();
    final @Nullable IScope currentScope = InternalSentrySdk.getCurrentScope();
    fetchNativeDeviceContexts(promise, options, context, currentScope);
  }

  protected void fetchNativeDeviceContexts(
      Promise promise,
      final @NotNull SentryOptions options,
      final @Nullable Context context,
      final @Nullable IScope currentScope) {
    if (!(options instanceof SentryAndroidOptions)) {
      promise.resolve(null);
      return;
    }
    if (context == null) {
      promise.resolve(null);
      return;
    }
    if (currentScope != null) {
      // Remove react-native breadcrumbs
      Iterator<Breadcrumb> breadcrumbsIterator = currentScope.getBreadcrumbs().iterator();
      while (breadcrumbsIterator.hasNext()) {
        Breadcrumb breadcrumb = breadcrumbsIterator.next();
        if ("react-native".equals(breadcrumb.getOrigin())) {
          breadcrumbsIterator.remove();
        }
      }
    }

    final @NotNull Map<String, Object> serialized =
        InternalSentrySdk.serializeScope(context, (SentryAndroidOptions) options, currentScope);
    final @Nullable Object deviceContext = RNSentryMapConverter.convertToWritable(serialized);
    promise.resolve(deviceContext);
  }

  public void fetchNativeSdkInfo(Promise promise) {
    final @Nullable SdkVersion sdkVersion = HubAdapter.getInstance().getOptions().getSdkVersion();
    if (sdkVersion == null) {
      promise.resolve(null);
    } else {
      final WritableMap sdkInfo = new WritableNativeMap();
      sdkInfo.putString("name", sdkVersion.getName());
      sdkInfo.putString("version", sdkVersion.getVersion());
      promise.resolve(sdkInfo);
    }
  }

  public String fetchNativePackageName() {
    return packageInfo.packageName;
  }

  public void getDataFromUri(String uri, Promise promise) {
    try {
      Uri contentUri = Uri.parse(uri);
      try (InputStream is =
          getReactApplicationContext().getContentResolver().openInputStream(contentUri)) {
        if (is == null) {
          String msg = "File not found for uri: " + uri;
          logger.log(SentryLevel.ERROR, msg);
          promise.reject(new Exception(msg));
          return;
        }

        ByteArrayOutputStream byteBuffer = new ByteArrayOutputStream();
        int bufferSize = 1024;
        byte[] buffer = new byte[bufferSize];
        int len;
        while ((len = is.read(buffer)) != -1) {
          byteBuffer.write(buffer, 0, len);
        }
        byte[] byteArray = byteBuffer.toByteArray();
        WritableArray jsArray = Arguments.createArray();
        for (byte b : byteArray) {
          jsArray.pushInt(b & 0xFF);
        }
        promise.resolve(jsArray);
      }
    } catch (IOException e) {
      String msg = "Error reading uri: " + uri + ": " + e.getMessage();
      logger.log(SentryLevel.ERROR, msg);
      promise.reject(new Exception(msg));
    }
  }

  public void crashedLastRun(Promise promise) {
    promise.resolve(Sentry.isCrashedLastRun());
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

  private boolean checkAndroidXAvailability() {
    try {
      Class.forName("androidx.core.app.FrameMetricsAggregator");
      return true;
    } catch (ClassNotFoundException ignored) {
      // androidx.core isn't available.
      return false;
    }
  }

  private boolean isFrameMetricsAggregatorAvailable() {
    return androidXAvailable && frameMetricsAggregator != null;
  }

  public static @Nullable String getURLFromDSN(@Nullable String dsn) {
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
