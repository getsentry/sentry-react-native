package io.sentry;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.WritableMap;

import io.sentry.android.SentryAndroid;
import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.dsn.Dsn;
import io.sentry.event.Breadcrumb;
import io.sentry.event.BreadcrumbBuilder;
import io.sentry.event.Event;
import io.sentry.event.EventBuilder;
import io.sentry.event.UserBuilder;
import io.sentry.event.interfaces.UserInterface;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

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
        SentryAndroid.init(this.getReactApplicationContext(), new Dsn(dsnString));
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
                for (Map.Entry<String, Object> entry : recursivelyDeconstructReadableMap(this.extra).entrySet()) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                }
            }
            for (Map.Entry<String, Object> entry : recursivelyDeconstructReadableMap(event.getMap("extra")).entrySet()) {
                eventBuilder.withExtra(entry.getKey(), entry.getValue());
            }
            
            if (this.tags != null) {
                for (Map.Entry<String, Object> entry : recursivelyDeconstructReadableMap(this.tags).entrySet()) {
                    eventBuilder.withExtra(entry.getKey(), entry.getValue());
                }
            }
            for (Map.Entry<String, Object> entry : recursivelyDeconstructReadableMap(event.getMap("tags")).entrySet()) {
                eventBuilder.withTag(entry.getKey(), entry.getValue().toString());
            }
            Event builtEvent = eventBuilder.build();
            Sentry.capture(builtEvent);

            // TODO we need to use a callback instead of this
            // could be that the event has not been sent yet
            // Also this is very dirty proof of concept on sending a event
            WritableMap params = Arguments.createMap();
            recursivelySetMap(params, event);
            params.putString("event_id", builtEvent.getId().toString());
            RNSentryEventEmitter.sendEvent(this.reactContext, RNSentryEventEmitter.SENTRY_EVENT_SENT_SUCCESSFULLY, params);
            // ----------
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
        promise.reject("bla", "blub");
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

    private void recursivelySetMap(WritableMap params, ReadableMap readableMap) {
        ReadableMapKeySetIterator iterator = readableMap.keySetIterator();
        while (iterator.hasNextKey()) {
            String key = iterator.nextKey();
            ReadableType type = readableMap.getType(key);
            switch (type) {
                case Null:
                    params.putNull(key);
                    break;
                case Boolean:
                    params.putBoolean(key, readableMap.getBoolean(key));
                    break;
                case Number:
                    params.putDouble(key, readableMap.getDouble(key));
                    break;
                case String:
                    params.putString(key, readableMap.getString(key));
                    break;
                case Map:
                    params.putMap(key, MapUtil.toWritableMap(recursivelyDeconstructReadableMap(readableMap.getMap(key))));
                    break;
                case Array:
                    params.putArray(key, ArrayUtil.toWritableArray(recursivelyDeconstructReadableArray(readableMap.getArray(key)).toArray()));
                    break;
                default:
                    throw new IllegalArgumentException("Could not convert object with key: " + key + ".");
            }

        }
    }

    private Map<String, Object> recursivelyDeconstructReadableMap(ReadableMap readableMap) {
        ReadableMapKeySetIterator iterator = readableMap.keySetIterator();
        Map<String, Object> deconstructedMap = new HashMap<>();
        while (iterator.hasNextKey()) {
            String key = iterator.nextKey();
            ReadableType type = readableMap.getType(key);
            switch (type) {
                case Null:
                    deconstructedMap.put(key, null);
                    break;
                case Boolean:
                    deconstructedMap.put(key, readableMap.getBoolean(key));
                    break;
                case Number:
                    deconstructedMap.put(key, readableMap.getDouble(key));
                    break;
                case String:
                    deconstructedMap.put(key, readableMap.getString(key));
                    break;
                case Map:
                    deconstructedMap.put(key, recursivelyDeconstructReadableMap(readableMap.getMap(key)));
                    break;
                case Array:
                    deconstructedMap.put(key, recursivelyDeconstructReadableArray(readableMap.getArray(key)));
                    break;
                default:
                    throw new IllegalArgumentException("Could not convert object with key: " + key + ".");
            }

        }
        return deconstructedMap;
    }

    private List<Object> recursivelyDeconstructReadableArray(ReadableArray readableArray) {
        List<Object> deconstructedList = new ArrayList<>(readableArray.size());
        for (int i = 0; i < readableArray.size(); i++) {
            ReadableType indexType = readableArray.getType(i);
            switch (indexType) {
                case Null:
                    deconstructedList.add(i, null);
                    break;
                case Boolean:
                    deconstructedList.add(i, readableArray.getBoolean(i));
                    break;
                case Number:
                    deconstructedList.add(i, readableArray.getDouble(i));
                    break;
                case String:
                    deconstructedList.add(i, readableArray.getString(i));
                    break;
                case Map:
                    deconstructedList.add(i, recursivelyDeconstructReadableMap(readableArray.getMap(i)));
                    break;
                case Array:
                    deconstructedList.add(i, recursivelyDeconstructReadableArray(readableArray.getArray(i)));
                    break;
                default:
                    throw new IllegalArgumentException("Could not convert object at index " + i + ".");
            }
        }
        return deconstructedList;
    }

}
