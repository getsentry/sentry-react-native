package io.sentry.react;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.util.SparseIntArray;

import androidx.core.app.FrameMetricsAggregator;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

import io.sentry.SentryEvent;
import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.AppStartState;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.Breadcrumb;
import io.sentry.HubAdapter;
import io.sentry.Integration;
import io.sentry.Sentry;
import io.sentry.SentryLevel;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.protocol.SdkVersion;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.SentryPackage;
import io.sentry.protocol.User;

@ReactModule(name = RNSentryModule.NAME)
public class RNSentryModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RNSentry";

    private static final Logger logger = Logger.getLogger("react-native-sentry");

    private PackageInfo packageInfo = null;
    private boolean didFetchAppStart;
    private FrameMetricsAggregator frameMetricsAggregator = null;
    private boolean androidXAvailable = true;

    // 700ms to constitute frozen frames.
    private static final int FROZEN_FRAME_THRESHOLD = 700;
    // 16ms (slower than 60fps) to constitute slow frames.
    private static final int SLOW_FRAME_THRESHOLD = 16;

    public RNSentryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        packageInfo = getPackageInfo(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("nativeClientAvailable", true);
        constants.put("nativeTransport", true);
        return constants;
    }

    @ReactMethod
    public void initNativeSdk(final ReadableMap rnOptions, Promise promise) {
        SentryAndroid.init(this.getReactApplicationContext(), options -> {
            if (rnOptions.hasKey("debug") && rnOptions.getBoolean("debug")) {
                options.setDebug(true);
                logger.setLevel(Level.INFO);
            }
            if (rnOptions.hasKey("dsn") && rnOptions.getString("dsn") != null) {
                String dsn = rnOptions.getString("dsn");
                logger.info(String.format("Starting with DSN: '%s'", dsn));
                options.setDsn(dsn);
            } else {
                // SentryAndroid needs an empty string fallback for the dsn.
                options.setDsn("");
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
                options.setShutdownTimeout(rnOptions.getInt("shutdownTimeout"));
            }
            if (rnOptions.hasKey("enableNdkScopeSync")) {
                options.setEnableScopeSync(rnOptions.getBoolean("enableNdkScopeSync"));
            }
            if (rnOptions.hasKey("attachStacktrace")) {
                options.setAttachStacktrace(rnOptions.getBoolean("attachStacktrace"));
            }
            if (rnOptions.hasKey("attachThreads")) {
                // JS use top level stacktraces and android attaches Threads which hides them so
                // by default we hide.
                options.setAttachThreads(rnOptions.getBoolean("attachThreads"));
            }
            if (rnOptions.hasKey("sendDefaultPii")) {
                options.setSendDefaultPii(rnOptions.getBoolean("sendDefaultPii"));
            }
            if (rnOptions.hasKey("enableAutoPerformanceTracking")
                    && rnOptions.getBoolean("enableAutoPerformanceTracking")) {
                androidXAvailable = checkAndroidXAvailability();

                if (androidXAvailable) {
                    frameMetricsAggregator = new FrameMetricsAggregator();
                    final Activity currentActivity = getCurrentActivity();

                    if (frameMetricsAggregator != null && currentActivity != null) {
                        try {
                            frameMetricsAggregator.add(currentActivity);
                        } catch (Throwable ignored) {
                            // throws ConcurrentModification when calling addOnFrameMetricsAvailableListener
                            // this is a best effort since we can't reproduce it
                            logger.warning("Error adding Activity to frameMetricsAggregator.");
                        }
                    }
                } else {
                    logger.warning("androidx.core' isn't available as a dependency.");
                }
            } else {
                this.disableNativeFramesTracking();
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

            logger.info(String.format("Native Integrations '%s'", options.getIntegrations().toString()));
        });

        promise.resolve(true);
    }

    @ReactMethod
    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash (only works in release mode)");
    }

    @ReactMethod
    public void fetchNativeRelease(Promise promise) {
        WritableMap release = Arguments.createMap();
        release.putString("id", packageInfo.packageName);
        release.putString("version", packageInfo.versionName);
        release.putString("build", String.valueOf(packageInfo.versionCode));
        promise.resolve(release);
    }

    @ReactMethod
    public void fetchNativeAppStart(Promise promise) {
        final AppStartState appStartInstance = AppStartState.getInstance();
        final Date appStartTime = appStartInstance.getAppStartTime();
        final Boolean isColdStart = appStartInstance.isColdStart();

        if (appStartTime == null) {
            logger.warning("App start won't be sent due to missing appStartTime.");
            promise.resolve(null);
        } else if (isColdStart == null) {
            logger.warning("App start won't be sent due to missing isColdStart.");
            promise.resolve(null);
        } else {
            final double appStartTimestamp = (double) appStartTime.getTime();

            WritableMap appStart = Arguments.createMap();

            appStart.putDouble("appStartTime", appStartTimestamp);
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
    @ReactMethod
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
                logger.warning("Error fetching native frames.");
                promise.resolve(null);
            }
        }
    }

    @ReactMethod
    public void captureEnvelope(String envelope, Promise promise) {
        try {
            final String outboxPath = HubAdapter.getInstance().getOptions().getOutboxPath();

            if (outboxPath == null) {
                logger.severe(
                        "Error retrieving outboxPath. Envelope will not be sent. Is the Android SDK initialized?");
            } else {
                File installation = new File(outboxPath, UUID.randomUUID().toString());
                try (FileOutputStream out = new FileOutputStream(installation)) {
                    out.write(envelope.getBytes(Charset.forName("UTF-8")));
                }
            }
        } catch (Throwable ignored) {
            logger.severe("Error reading envelope");
        }
        promise.resolve(true);
    }

    @ReactMethod
    public void getStringBytesLength(String payload, Promise promise) {
        try {
            promise.resolve(payload.getBytes("UTF-8").length);
        } catch (UnsupportedEncodingException e) {
            promise.reject(e);
        }
    }

    private static PackageInfo getPackageInfo(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            logger.warning("Error getting package info.");
            return null;
        }
    }

    @ReactMethod
    public void setUser(final ReadableMap user, final ReadableMap otherUserKeys) {
        Sentry.configureScope(scope -> {
            if (user == null && otherUserKeys == null) {
                scope.setUser(null);
            } else {
                User userInstance = new User();

                if (user != null) {
                    if (user.hasKey("email")) {
                        userInstance.setEmail(user.getString("email"));
                    }

                    if (user.hasKey("id")) {
                        userInstance.setId(user.getString("id"));
                    }

                    if (user.hasKey("username")) {
                        userInstance.setUsername(user.getString("username"));
                    }

                    if (user.hasKey("ip_address")) {
                        userInstance.setIpAddress(user.getString("ip_address"));
                    }
                }

                if (otherUserKeys != null) {
                    HashMap<String, String> otherUserKeysMap = new HashMap<String, String>();
                    ReadableMapKeySetIterator it = otherUserKeys.keySetIterator();
                    while (it.hasNextKey()) {
                        String key = it.nextKey();
                        String value = otherUserKeys.getString(key);

                        otherUserKeysMap.put(key, value);
                    }

                    userInstance.setOthers(otherUserKeysMap);
                }

                scope.setUser(userInstance);
            }
        });
    }

    @ReactMethod
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
                    case "info":
                        breadcrumbInstance.setLevel(SentryLevel.INFO);
                        break;
                    case "debug":
                        breadcrumbInstance.setLevel(SentryLevel.DEBUG);
                        break;
                    case "error":
                        breadcrumbInstance.setLevel(SentryLevel.ERROR);
                        break;
                    default:
                        breadcrumbInstance.setLevel(SentryLevel.ERROR);
                        break;
                }
            }

            if (breadcrumb.hasKey("data")) {
                ReadableMap data = breadcrumb.getMap("data");
                ReadableMapKeySetIterator it = data.keySetIterator();
                while (it.hasNextKey()) {
                    String key = it.nextKey();
                    String value = data.getString(key);

                    breadcrumbInstance.setData(key, value);
                }
            }

            scope.addBreadcrumb(breadcrumbInstance);
        });
    }

    @ReactMethod
    public void clearBreadcrumbs() {
        Sentry.configureScope(scope -> {
            scope.clearBreadcrumbs();
        });
    }

    @ReactMethod
    public void setExtra(String key, String extra) {
        Sentry.configureScope(scope -> {
            scope.setExtra(key, extra);
        });
    }

    @ReactMethod
    public void setTag(String key, String value) {
        Sentry.configureScope(scope -> {
            scope.setTag(key, value);
        });
    }

    @ReactMethod
    public void closeNativeSdk(Promise promise) {
        Sentry.close();

        disableNativeFramesTracking();

        promise.resolve(true);
    }

    @ReactMethod
    public void disableNativeFramesTracking() {
        if (isFrameMetricsAggregatorAvailable()) {
            frameMetricsAggregator.stop();
            frameMetricsAggregator = null;
        }
    }

    private void setEventOriginTag(SentryEvent event) {
        SdkVersion sdk = event.getSdk();
        if (sdk != null) {
            switch (sdk.getName()) {
                // If the event is from capacitor js, it gets set there and we do not handle it
                // here.
                case "sentry.native":
                    setEventEnvironmentTag(event, "android", "native");
                    break;
                case "sentry.java.android":
                    setEventEnvironmentTag(event, "android", "java");
                    break;
                default:
                    break;
            }
        }
    }

    private void setEventEnvironmentTag(SentryEvent event, String origin, String environment) {
        event.setTag("event.origin", origin);
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
