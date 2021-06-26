package io.sentry.react;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.Sentry;
import io.sentry.Breadcrumb;
import io.sentry.HubAdapter;
import io.sentry.Integration;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.UncaughtExceptionHandlerIntegration;
import io.sentry.protocol.SdkVersion;
import io.sentry.protocol.SentryException;
import io.sentry.protocol.User;

@ReactModule(name = RNSentryModule.NAME)
public class RNSentryModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RNSentry";

    final static Logger logger = Logger.getLogger("react-native-sentry");

    private static PackageInfo packageInfo;

    public RNSentryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        RNSentryModule.packageInfo = getPackageInfo(reactContext);
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
    public void startWithOptions(final ReadableMap rnOptions, Promise promise) {
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

            options.setBeforeSend((event, hint) -> {
                // React native internally throws a JavascriptException
                // Since we catch it before that, we don't want to send this one
                // because we would send it twice
                try {
                    SentryException ex = event.getExceptions().get(0);
                    if (null != ex && ex.getType().contains("JavascriptException")) {
                        return null;
                    }
                } catch (Exception e) {
                    // We do nothing
                }

                // Add on the correct event.origin tag.
                // it needs to be here so we can determine where it originated from.
                SdkVersion sdkVersion = event.getSdk();
                if (sdkVersion != null) {
                    String sdkName = sdkVersion.getName();
                    if (sdkName != null) {
                        if (sdkName.equals("sentry.javascript.react-native")) {
                            event.setTag("event.origin", "javascript");
                        } else if (sdkName.equals("sentry.java.android") || sdkName.equals("sentry.native")) {
                            event.setTag("event.origin", "android");

                            if (sdkName.equals("sentry.native")) {
                                event.setTag("event.environment", "native");
                            } else {
                                event.setTag("event.environment", "java");
                            }
                        }
                    }
                }

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
    public void fetchRelease(Promise promise) {
        WritableMap release = Arguments.createMap();
        release.putString("id", packageInfo.packageName);
        release.putString("version", packageInfo.versionName);
        release.putString("build", String.valueOf(packageInfo.versionCode));
        promise.resolve(release);
    }

    @ReactMethod
    public void captureEnvelope(String envelope, Promise promise) {
        try {
            final String outboxPath = HubAdapter.getInstance().getOptions().getOutboxPath();

            if (outboxPath == null) {
                logger.severe("Error retrieving outboxPath. Envelope will not be sent. Is the Android SDK initialized?");
            } else {
                File installation = new File(outboxPath, UUID.randomUUID().toString());
                try (FileOutputStream out = new FileOutputStream(installation)) {
                    out.write(envelope.getBytes(Charset.forName("UTF-8")));
                }
            }
        } catch (Exception e) {
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
      promise.resolve(true);
    }
}
