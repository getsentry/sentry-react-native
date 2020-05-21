package io.sentry;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import java.util.logging.Logger;

import io.sentry.android.core.AnrIntegration;
import io.sentry.android.core.NdkIntegration;
import io.sentry.android.core.SentryAndroid;
import io.sentry.core.Integration;
import io.sentry.core.SentryOptions;
import io.sentry.core.UncaughtExceptionHandlerIntegration;
import io.sentry.core.protocol.SentryException;

@ReactModule(name = RNSentryModule.NAME)
public class RNSentryModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RNSentry";

    final static Logger logger = Logger.getLogger("react-native-sentry");

    private static PackageInfo packageInfo;
    private SentryOptions sentryOptions;

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
            if (rnOptions.hasKey("dsn") && rnOptions.getString("dsn") != null) {
                options.setDsn(rnOptions.getString("dsn"));
            } else {
                // SentryAndroid needs an empty string fallback for the dsn.
                options.setDsn("");
            }
            if (rnOptions.hasKey("debug") && rnOptions.getBoolean("debug")) {
                options.setDebug(true);
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
                return event;
            });

            for (Iterator<Integration> iterator = options.getIntegrations().iterator(); iterator.hasNext();) {
                Integration integration = iterator.next();
                if (rnOptions.hasKey("enableNativeCrashHandling")
                        && !rnOptions.getBoolean("enableNativeCrashHandling")) {
                    if (integration instanceof UncaughtExceptionHandlerIntegration
                            || integration instanceof AnrIntegration || integration instanceof NdkIntegration) {
                        iterator.remove();
                    }
                }
            }

            logger.info(String.format("Native Integrations '%s'", options.getIntegrations().toString()));
            sentryOptions = options;
        });

        if (rnOptions.hasKey("dsn")) {
            logger.info(String.format("startWithDsnString '%s'", rnOptions.getString("dsn")));
        }

        promise.resolve(true);
    }

    @ReactMethod
    public void setLogLevel(int level) {
        logger.setLevel(this.logLevel(level));
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
            File installation = new File(sentryOptions.getOutboxPath(), UUID.randomUUID().toString());
            try (FileOutputStream out = new FileOutputStream(installation)) {
                out.write(envelope.getBytes(Charset.forName("UTF-8")));
            }
        } catch (Exception e) {
            logger.info("Error reading envelope");
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
            logger.info("Error getting package info.");
            return null;
        }
    }

    private Level logLevel(int level) {
        switch (level) {
            case 1:
                return Level.SEVERE;
            case 2:
                return Level.INFO;
            case 3:
                return Level.ALL;
            default:
                return Level.OFF;
        }
    }
}
