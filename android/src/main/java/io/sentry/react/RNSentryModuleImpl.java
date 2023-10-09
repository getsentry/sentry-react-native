package io.sentry.react;

import static io.sentry.android.core.internal.util.ScreenshotUtils.takeScreenshot;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.util.SparseIntArray;

import androidx.core.app.FrameMetricsAggregator;

import com.facebook.hermes.instrumentation.HermesSamplingProfiler;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeArray;
import com.facebook.react.bridge.WritableNativeMap;

import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import io.sentry.Breadcrumb;
import io.sentry.DateUtils;
import io.sentry.HubAdapter;
import io.sentry.ILogger;
import io.sentry.ISerializer;
import io.sentry.Integration;
import io.sentry.Scope;
import io.sentry.Sentry;
import io.sentry.SentryDate;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.android.core.AndroidLogger;
import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.AppStartState;
import io.sentry.android.core.BuildConfig;
import io.sentry.android.core.BuildInfoProvider;
import io.sentry.android.core.CurrentActivityHolder;
import io.sentry.android.core.InternalSentrySdk;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.android.core.SentryAndroidOptions;
import io.sentry.android.core.ViewHierarchyEventProcessor;
import io.sentry.protocol.SdkVersion;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentryPackage;
import io.sentry.protocol.User;
import io.sentry.protocol.ViewHierarchy;
import io.sentry.util.JsonSerializationUtils;

public class RNSentryModuleImpl {

    public static final String NAME = "RNSentry";

    private static final String NATIVE_SDK_NAME = "sentry.native.android.react-native";
    private static final String ANDROID_SDK_NAME = "sentry.java.android.react-native";
    private static final ILogger logger = new AndroidLogger(NAME);
    private static final BuildInfoProvider buildInfo = new BuildInfoProvider(logger);
    private static final String modulesPath = "modules.json";
    private static final Charset UTF_8 = Charset.forName("UTF-8");

    private final ReactApplicationContext reactApplicationContext;
    private final PackageInfo packageInfo;
    private FrameMetricsAggregator frameMetricsAggregator = null;
    private boolean androidXAvailable;

    private static boolean didFetchAppStart;

    // 700ms to constitute frozen frames.
    private static final int FROZEN_FRAME_THRESHOLD = 700;
    // 16ms (slower than 60fps) to constitute slow frames.
    private static final int SLOW_FRAME_THRESHOLD = 16;

    private static final int SCREENSHOT_TIMEOUT_SECONDS = 2;

    public RNSentryModuleImpl(ReactApplicationContext reactApplicationContext) {
        packageInfo = getPackageInfo(reactApplicationContext);
        this.reactApplicationContext = reactApplicationContext;
    }

    private ReactApplicationContext getReactApplicationContext() {
        return this.reactApplicationContext;
    }

    private @Nullable
    Activity getCurrentActivity() {
        return this.reactApplicationContext.getCurrentActivity();
    }

    public void initNativeSdk(final ReadableMap rnOptions, Promise promise) {
        SentryAndroid.init(this.getReactApplicationContext(), options -> {
            @Nullable SdkVersion sdkVersion = options.getSdkVersion();
            if (sdkVersion == null) {
                sdkVersion = new SdkVersion(ANDROID_SDK_NAME, BuildConfig.VERSION_NAME);
            } else {
                sdkVersion.setName(ANDROID_SDK_NAME);
            }

            options.setSentryClientName(sdkVersion.getName() + "/" + sdkVersion.getVersion());
            options.setNativeSdkName(NATIVE_SDK_NAME);
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

            options.setBeforeSend((event, hint) -> {
                // React native internally throws a JavascriptException
                // Since we catch it before that, we don't want to send this one
                // because we would send it twice
                try {
                    SentryException ex = event.getExceptions().get(0);
                    if (null != ex && ex.getType().contains("JavascriptException")) {
                        return null;
                    }
                } catch (Throwable ignored) {
                    // We do nothing
                }

                setEventOriginTag(event);
                addPackages(event, options.getSdkVersion());

                return event;
            });

            if (rnOptions.hasKey("enableNativeCrashHandling") && !rnOptions.getBoolean("enableNativeCrashHandling")) {
                final List<Integration> integrations = options.getIntegrations();
                for (final Integration integration : integrations) {
                    if (integration instanceof UncaughtExceptionHandlerIntegration
                            || integration instanceof AnrIntegration || integration instanceof NdkIntegration) {
                        integrations.remove(integration);
                    }
                }
            }
            logger.log(SentryLevel.INFO, String.format("Native Integrations '%s'", options.getIntegrations()));

            final CurrentActivityHolder currentActivityHolder = CurrentActivityHolder.getInstance();
            final Activity currentActivity = getCurrentActivity();
            if (currentActivity != null) {
                currentActivityHolder.setActivity(currentActivity);
            }
        });

        promise.resolve(true);
    }

    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash (only works in release mode)");
    }

    public void fetchModules(Promise promise) {
        final AssetManager assets = this.getReactApplicationContext().getResources().getAssets();
        try (final InputStream stream =
                     new BufferedInputStream(assets.open(RNSentryModuleImpl.modulesPath))) {
            int size = stream.available();
            byte[] buffer = new byte[size];
            stream.read(buffer);
            stream.close();
            String modulesJson = new String(buffer, RNSentryModuleImpl.UTF_8);
            promise.resolve(modulesJson);
        } catch (FileNotFoundException e) {
            promise.resolve(null);
        } catch (Throwable e) {
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
        final AppStartState appStartInstance = AppStartState.getInstance();
        final SentryDate appStartTime = appStartInstance.getAppStartTime();
        final Boolean isColdStart = appStartInstance.isColdStart();

        if (appStartTime == null) {
            logger.log(SentryLevel.WARNING, "App start won't be sent due to missing appStartTime.");
            promise.resolve(null);
        } else if (isColdStart == null) {
            logger.log(SentryLevel.WARNING, "App start won't be sent due to missing isColdStart.");
            promise.resolve(null);
        } else {
            final double appStartTimestampMs = DateUtils.nanosToMillis(appStartTime.nanoTimestamp());

            WritableMap appStart = Arguments.createMap();

            appStart.putDouble("appStartTime", appStartTimestampMs);
            appStart.putBoolean("isColdStart", isColdStart);
            appStart.putBoolean("didFetchAppStart", didFetchAppStart);

            promise.resolve(appStart);
        }
        // This is always set to true, as we would only allow an app start fetch to only
        // happen once in the case of a JS bundle reload, we do not want it to be
        // instrumented again.
        didFetchAppStart = true;
    }

    /**
     * Returns frames metrics at the current point in time.
     */
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

                if (totalFrames == 0 && slowFrames == 0 && frozenFrames == 0) {
                    promise.resolve(null);
                    return;
                }

                WritableMap map = Arguments.createMap();
                map.putInt("totalFrames", totalFrames);
                map.putInt("slowFrames", slowFrames);
                map.putInt("frozenFrames", frozenFrames);

                promise.resolve(map);
            } catch (Throwable ignored) {
                logger.log(SentryLevel.WARNING, "Error fetching native frames.");
                promise.resolve(null);
            }
        }
    }

    public void captureEnvelope(ReadableArray rawBytes, ReadableMap options, Promise promise) {
        byte[] bytes = new byte[rawBytes.size()];
        for (int i = 0; i < rawBytes.size(); i++) {
            bytes[i] = (byte) rawBytes.getInt(i);
        }

        try {
            InternalSentrySdk.captureEnvelope(bytes);
        } catch (Throwable e) {
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

        if (raw == null) {
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
        final Runnable runTakeScreenshot = () -> {
            bytesWrapper[0] = takeScreenshot(activity, logger, buildInfo);
            doneSignal.countDown();
        };

        if (UiThreadUtil.isOnUiThread()) {
            runTakeScreenshot.run();
        } else {
            UiThreadUtil.runOnUiThread(runTakeScreenshot);
        }

        try {
            doneSignal.await(SCREENSHOT_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            logger.log(SentryLevel.ERROR, "Screenshot process was interrupted.");
            return null;
        }

        return bytesWrapper[0];
    }

    public void fetchViewHierarchy(Promise promise) {
        final @Nullable Activity activity = getCurrentActivity();
        final @Nullable ViewHierarchy viewHierarchy = ViewHierarchyEventProcessor.snapshotViewHierarchy(activity, logger);
        if (viewHierarchy == null) {
            logger.log(SentryLevel.ERROR, "Could not get ViewHierarchy.");
            promise.resolve(null);
            return;
        }

        ISerializer serializer = HubAdapter.getInstance().getOptions().getSerializer();
        final @Nullable byte[] bytes = JsonSerializationUtils.bytesFrom(serializer, logger, viewHierarchy);
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
        Sentry.configureScope(scope -> {
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
                    HashMap<String, String> userDataMap = new HashMap<>();
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
        Sentry.configureScope(scope -> {
            Breadcrumb breadcrumbInstance = new Breadcrumb();

            if (breadcrumb.hasKey("message")) {
                breadcrumbInstance.setMessage(breadcrumb.getString("message"));
            }

            if (breadcrumb.hasKey("type")) {
                breadcrumbInstance.setType(breadcrumb.getString("type"));
            }

            if (breadcrumb.hasKey("category")) {
                breadcrumbInstance.setCategory(breadcrumb.getString("category"));
            }

            if (breadcrumb.hasKey("level")) {
                switch (breadcrumb.getString("level")) {
                    case "fatal":
                        breadcrumbInstance.setLevel(SentryLevel.FATAL);
                        break;
                    case "warning":
                        breadcrumbInstance.setLevel(SentryLevel.WARNING);
                        break;
                    case "debug":
                        breadcrumbInstance.setLevel(SentryLevel.DEBUG);
                        break;
                    case "error":
                        breadcrumbInstance.setLevel(SentryLevel.ERROR);
                        break;
                    case "info":
                    default:
                        breadcrumbInstance.setLevel(SentryLevel.INFO);
                        break;
                }
            }

            if (breadcrumb.hasKey("data")) {
                final ReadableMap data = breadcrumb.getMap("data");
                for (final Map.Entry<String, Object> entry : data.toHashMap().entrySet()) {
                    final Object value = entry.getValue();
                    // data is ConcurrentHashMap and can't have null values
                    if (value != null) {
                        breadcrumbInstance.setData(entry.getKey(), entry.getValue());
                    }
                }
            }

            scope.addBreadcrumb(breadcrumbInstance);
        });
    }

    public void clearBreadcrumbs() {
        Sentry.configureScope(scope -> {
            scope.clearBreadcrumbs();
        });
    }

    public void setExtra(String key, String extra) {
        Sentry.configureScope(scope -> {
            scope.setExtra(key, extra);
        });
    }

    public void setContext(final String key, final ReadableMap context) {
        if (key == null || context == null) {
            return;
        }
        Sentry.configureScope(scope -> {
            final HashMap<String, Object> contextHashMap = context.toHashMap();

            scope.setContexts(key, contextHashMap);
        });
    }

    public void setTag(String key, String value) {
        Sentry.configureScope(scope -> {
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
                } catch (Throwable ignored) {
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

    public WritableMap startProfiling() {
        final WritableMap result = new WritableNativeMap();
        try {
            HermesSamplingProfiler.enable();
            result.putBoolean("started", true);
        } catch (Throwable e) {
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
            HermesSamplingProfiler.disable();

            output = File.createTempFile(
                "sampling-profiler-trace", ".cpuprofile", reactApplicationContext.getCacheDir());

            if (isDebug) {
                logger.log(SentryLevel.INFO, "Profile saved to: " + output.getAbsolutePath());
            }

            try (final BufferedReader br = new BufferedReader(new FileReader(output));) {
                HermesSamplingProfiler.dumpSampledTraceToFile(output.getPath());

                final StringBuilder text = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) {
                    text.append(line);
                    text.append('\n');
                }

                result.putString("profile", text.toString());
            }
        } catch (Throwable e) {
            result.putString("error", e.toString());
        } finally {
            if (output != null) {
                try {
                    final boolean wasProfileSuccessfullyDeleted = output.delete();
                    if (!wasProfileSuccessfullyDeleted) {
                       logger.log(SentryLevel.WARNING, "Profile not deleted from:" + output.getAbsolutePath());
                    }
                } catch (Throwable e) {
                    logger.log(SentryLevel.WARNING, "Profile not deleted from:" + output.getAbsolutePath());
                }
            }
        }
        return result;
    }

    public void fetchNativeDeviceContexts(Promise promise) {
        final @NotNull SentryOptions options = HubAdapter.getInstance().getOptions();
        if (!(options instanceof SentryAndroidOptions)) {
            promise.resolve(null);
            return;
        }

        final @Nullable Context context = this.getReactApplicationContext().getApplicationContext();
        if (context == null) {
            promise.resolve(null);
            return;
        }

        final @Nullable Scope currentScope = InternalSentrySdk.getCurrentScope();
        final @NotNull Map<String, Object> serialized = InternalSentrySdk.serializeScope(
                context,
                (SentryAndroidOptions) options,
                currentScope);
        final @Nullable Object deviceContext = MapConverter.convertToWritable(serialized);
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

    public void fetchNativePackageName(Promise promise) {
        promise.resolve(packageInfo.packageName);
    }

    private void setEventOriginTag(SentryEvent event) {
        SdkVersion sdk = event.getSdk();
        if (sdk != null) {
            switch (sdk.getName()) {
                // If the event is from capacitor js, it gets set there and we do not handle it
                // here.
                case NATIVE_SDK_NAME:
                    setEventEnvironmentTag(event, "native");
                    break;
                case ANDROID_SDK_NAME:
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
        if (eventSdk != null && eventSdk.getName().equals("sentry.javascript.react-native") && sdk != null) {
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
}
