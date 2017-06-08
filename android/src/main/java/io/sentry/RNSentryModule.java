package io.sentry;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.support.annotation.NonNull;

import com.facebook.react.ReactApplication;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableNativeArray;
import com.facebook.react.bridge.ReadableNativeMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import io.sentry.android.AndroidSentryClientFactory;
import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.connection.EventSendCallback;
import io.sentry.event.Breadcrumb;
import io.sentry.event.BreadcrumbBuilder;
import io.sentry.event.Event;
import io.sentry.event.EventBuilder;
import io.sentry.event.User;
import io.sentry.event.UserBuilder;
import io.sentry.event.interfaces.UserInterface;

public class RNSentryModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;
    private final ReactApplication reactApplication;

    private static AndroidEventBuilderHelper androidHelper;
    private static PackageInfo packageInfo;
    final static Logger logger = Logger.getLogger("react-native-sentry");
    private static WritableNativeMap extra;
    private static ReadableMap tags;

    public RNSentryModule(ReactApplicationContext reactContext, ReactApplication reactApplication) {
        super(reactContext);
        this.reactContext = reactContext;
        this.reactApplication = reactApplication;
        RNSentryModule.extra = new WritableNativeMap();
        RNSentryModule.packageInfo = getPackageInfo(reactContext);
    }

    public ReactApplication getReactApplication() {
        return reactApplication;
    }

    @Override
    public String getName() {
        return "RNSentry";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("nativeClientAvailable", true);
        return constants;
    }

    @ReactMethod
    public void startWithDsnString(String dsnString) {
        SentryClient sentryClient = Sentry.init(dsnString, new AndroidSentryClientFactory(this.getReactApplicationContext()));
        androidHelper = new AndroidEventBuilderHelper(this.getReactApplicationContext());
        sentryClient.addEventSendCallback(new EventSendCallback() {
            @Override
            public void onFailure(Event event, Exception exception) {

            }

            @Override
            public void onSuccess(Event event) {
                WritableMap params = Arguments.createMap();
                params.putString("event_id", event.getId().toString());
                params.putString("level", event.getLevel().toString().toLowerCase());
                RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_SENT_SUCCESSFULLY, params);
            }
        });
        logger.info(String.format("startWithDsnString '%s'", dsnString));
    }

    @ReactMethod
    public void setLogLevel(int level) {
        logger.setLevel(this.logLevel(level));
    }

    @ReactMethod
    public void setExtra(ReadableMap extra) {
        RNSentryModule.extra.merge(extra);
    }

    @ReactMethod
    public void addExtra(String key, String value) {
        RNSentryModule.extra.putString(key, value);
        logger.info(String.format("addExtra '%s' '%s'", key, value));
    }

    @ReactMethod
    public void setTags(ReadableMap tags) {
        RNSentryModule.tags = tags;
    }

    @ReactMethod
    public void setUser(ReadableMap user) {
        UserBuilder userBuilder = getUserBuilder(user);
        User builtUser = userBuilder.build();
        if (builtUser.getId() != null) {
            Sentry.setUser(builtUser);
        }
    }

    @ReactMethod
    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash");
    }

    @ReactMethod
    public void captureBreadcrumb(ReadableMap breadcrumb) {
        logger.info(String.format("captureEvent '%s'", breadcrumb));
        if (breadcrumb.hasKey("message")) {
            Sentry.record(
                    new BreadcrumbBuilder()
                            .setMessage(breadcrumb.getString("message"))
                            .setCategory(breadcrumb.getString("category"))
                            .setLevel(breadcrumbLevel((ReadableNativeMap)breadcrumb))
                            .build()
            );
        }
    }

    @ReactMethod
    public void captureEvent(ReadableMap event) {
        ReadableNativeMap castEvent = (ReadableNativeMap)event;
        if (event.hasKey("message")) {
            EventBuilder eventBuilder = new EventBuilder()
                    .withMessage(event.getString("message"))
                    .withLevel(eventLevel(castEvent));

            if (event.hasKey("logger")) {
                eventBuilder.withLogger(event.getString("logger"));
            }

            if (event.hasKey("user")) {
                UserBuilder userBuilder = getUserBuilder(event.getMap("user"));
                User builtUser = userBuilder.build();
                if (builtUser.getId() != null) {
                    UserInterface userInterface = new UserInterface(
                            builtUser.getId(),
                            builtUser.getUsername(),
                            null,
                            builtUser.getEmail()
                    );
                    eventBuilder.withSentryInterface(userInterface);
                }
            }

            if (castEvent.hasKey("extra")) {
                for (Map.Entry<String, Object> entry : castEvent.getMap("extra").toHashMap().entrySet()) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                }
            }

            if (castEvent.hasKey("tags")) {
                for (Map.Entry<String, Object> entry : castEvent.getMap("tags").toHashMap().entrySet()) {
                    eventBuilder.withTag(entry.getKey(), entry.getValue().toString());
                }
            }

            Sentry.capture(buildEvent(eventBuilder));
        } else {
            RNSentryExceptionsManagerModule.lastReceivedException = event;
            if (this.getReactApplication().getReactNativeHost().getUseDeveloperSupport() == true) {
                ReadableNativeArray exceptionValues = ((ReadableNativeArray)RNSentryExceptionsManagerModule.lastReceivedException.getMap("exception").getArray("values"));
                ReadableNativeMap exception = exceptionValues.getMap(0);
                ReadableNativeMap stacktrace = exception.getMap("stacktrace");
                RNSentryExceptionsManagerModule.convertAndCaptureReactNativeException("", stacktrace.getArray("frames"));
            }
        }
    }

    @ReactMethod
    public void clearContext() {
        Sentry.clearContext();
        RNSentryModule.extra = new WritableNativeMap();
        RNSentryModule.tags = null;
    }

    @ReactMethod
    public void activateStacktraceMerging(Promise promise) {
        logger.info("TODO: implement activateStacktraceMerging");
//        promise.resolve(true);
        promise.reject("Sentry", "Stacktrace merging not yet implemented");
    }

    @NonNull
    private UserBuilder getUserBuilder(ReadableMap user) {
        UserBuilder userBuilder = new UserBuilder();
        if (user.hasKey("email")) {
            userBuilder.setEmail(user.getString("email"));
        }
        if (user.hasKey("userID")) {
            userBuilder.setId(user.getString("userID"));
        } else if (user.hasKey("id")) {
            userBuilder.setId(user.getString("id"));
        }
        if (user.hasKey("username")) {
            userBuilder.setUsername(user.getString("username"));
        }
        return userBuilder;
    }

    public static Event buildEvent(EventBuilder eventBuilder) {
        androidHelper.helpBuildingEvent(eventBuilder);

        setRelease(eventBuilder);
        stripInternalSentry(eventBuilder);

        if (extra != null) {
            for (Map.Entry<String, Object> entry : extra.toHashMap().entrySet()) {
                if (entry.getValue() != null) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                    logger.info(String.format("addExtra '%s' '%s'", entry.getKey(), entry.getValue()));
                }
            }
        }
        if (tags != null) {
            for (Map.Entry<String, Object> entry : ((ReadableNativeMap)tags).toHashMap().entrySet()) {
                eventBuilder.withExtra(entry.getKey(), entry.getValue());
            }
        }

        return eventBuilder.build();
    }

    private static void stripInternalSentry(EventBuilder eventBuilder) {
        if (extra != null) {
            for (Map.Entry<String, Object> entry : extra.toHashMap().entrySet()) {
                if (entry.getKey().startsWith("__sentry")) {
                    extra.putNull(entry.getKey());
                }
            }
        }
    }

    private static void setRelease(EventBuilder eventBuilder) {
        if (extra.hasKey("__sentry_version")) {
            eventBuilder.withRelease(packageInfo.packageName + "-" + extra.getString("__sentry_version"));
            eventBuilder.withDist(null);
        }
        if (extra.hasKey("__sentry_release")) {
            eventBuilder.withRelease(extra.getString("__sentry_release"));
        }
        if (extra.hasKey("__sentry_dist")) {
            eventBuilder.withDist(extra.getString("__sentry_dist"));
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

    private Breadcrumb.Level breadcrumbLevel(ReadableNativeMap breadcrumb) {
        String level = "";
        if (breadcrumb.hasKey("level")) {
            level = breadcrumb.getString("level");
        }
        switch (level) {
            case "critical":
                return Breadcrumb.Level.CRITICAL;
            case "warning":
                return Breadcrumb.Level.WARNING;
            case "info":
                return Breadcrumb.Level.INFO;
            case "debug":
                return Breadcrumb.Level.DEBUG;
            default:
                return Breadcrumb.Level.ERROR;
        }
    }

    private Event.Level eventLevel(ReadableNativeMap event) {
        String level = "";
        if (event.hasKey("level")) {
            level = event.getString("level");
        }
        switch (level) {
            case "fatal":
                return Event.Level.FATAL;
            case "warning":
                return Event.Level.WARNING;
            case "info":
                return Event.Level.INFO;
            case "debug":
                return Event.Level.DEBUG;
            default:
                return Event.Level.ERROR;
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
