package io.sentry;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableNativeMap;
import com.facebook.react.bridge.WritableMap;

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
import io.sentry.event.UserBuilder;
import io.sentry.event.interfaces.UserInterface;

public class RNSentryModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;
    final static Logger logger = Logger.getLogger("react-native-sentry");
    private ReadableMap extra;
    private ReadableMap tags;

    public RNSentryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
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
        this.extra = extra;
    }

    @ReactMethod
    public void setTags(ReadableMap tags) {
        this.tags = tags;
    }

    @ReactMethod
    public void setUser(ReadableMap user) {
        Sentry.setUser(
                new UserBuilder()
                        .setEmail(user.getString("email"))
                        .setId(user.getString("userID"))
                        .setUsername(user.getString("username"))
                        .build()
        );
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
                            .setLevel(breadcrumbLevel(breadcrumb.getString("level")))
                            .build()
            );
        }
    }

    @ReactMethod
    public void captureEvent(ReadableMap event) {
        ReadableNativeMap castEvent = (ReadableNativeMap)event;
        if (event.hasKey("message")) {
            AndroidEventBuilderHelper helper = new AndroidEventBuilderHelper(this.getReactApplicationContext());
            EventBuilder eventBuilder = new EventBuilder()
                    .withMessage(event.getString("message"))
                    .withLogger(event.getString("logger"))
                    .withLevel(eventLevel(event.getString("level")));

            eventBuilder.withSentryInterface(
                    new UserInterface(
                            event.getMap("user").getString("userID"),
                            event.getMap("user").getString("username"),
                            null,
                            event.getMap("user").getString("email")
                    )
            );

            helper.helpBuildingEvent(eventBuilder);

            if (this.extra != null) {
                for (Map.Entry<String, Object> entry : ((ReadableNativeMap)this.extra).toHashMap().entrySet()) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                }
            }
            for (Map.Entry<String, Object> entry : castEvent.getMap("extra").toHashMap().entrySet()) {
                eventBuilder.withExtra(entry.getKey(), entry.getValue());
            }

            if (this.tags != null) {
                for (Map.Entry<String, Object> entry : ((ReadableNativeMap)this.tags).toHashMap().entrySet()) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                }
            }
            for (Map.Entry<String, Object> entry : castEvent.getMap("tags").toHashMap().entrySet()) {
                eventBuilder.withTag(entry.getKey(), entry.getValue().toString());
            }
            Event builtEvent = eventBuilder.build();
            Sentry.capture(builtEvent);
        } else {
            logger.info("Event has no key message which means it is a js error");
        }
    }

    @ReactMethod
    public void clearContext() {
        Sentry.clearContext();
    }

    @ReactMethod
    public void activateStacktraceMerging(Promise promise) {
        logger.info("TODO: implement activateStacktraceMerging");
//        promise.resolve(true);
        promise.reject("Sentry", "Stacktrace merging not yet implemented");
    }

    private Breadcrumb.Level breadcrumbLevel(String level) {
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

    private Event.Level eventLevel(String level) {
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
