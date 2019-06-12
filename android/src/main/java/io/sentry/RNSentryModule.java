package io.sentry;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.connection.EventSendCallback;
import io.sentry.event.Breadcrumb;
import io.sentry.event.BreadcrumbBuilder;
import io.sentry.event.Event;
import io.sentry.event.EventBuilder;
import io.sentry.android.AndroidSentryClientFactory;
import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.event.Event;
import io.sentry.event.helper.ShouldSendEventCallback;
import io.sentry.event.interfaces.ExceptionInterface;

public class RNSentryModule extends ReactContextBaseJavaModule {

    private final ReactApplicationContext reactContext;

    private static AndroidEventBuilderHelper androidHelper;
    final static Logger logger = Logger.getLogger("react-native-sentry");
    private static SentryClient sentryClient;

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
        constants.put("nativeTransport", true);
        return constants;
    }

    @ReactMethod
    public void startWithDsnString(String dsnString, final ReadableMap options, Promise promise) {
        if (sentryClient != null) {
            logger.info(String.format("Already started, use existing client '%s'", dsnString));
            promise.resolve(false);
            return;
        }

        try {
            sentryClient = Sentry.init(dsnString, new AndroidSentryClientFactory(this.getReactApplicationContext()));
        } catch (Exception e) {
            logger.info(String.format("Catching on startWithDsnString, calling callback" + e.getMessage()));
            promise.reject("SentryError", "Error during init", e);
            return;
        }

        androidHelper = new AndroidEventBuilderHelper(this.getReactApplicationContext());
        sentryClient.addShouldSendEventCallback(new ShouldSendEventCallback() {
            @Override
            public boolean shouldSend(Event event) {
                // We don't want to send events that are from ExceptionsManagerModule.
                // Because we sent it already from raven.
                if (event.getSentryInterfaces().containsKey(ExceptionInterface.EXCEPTION_INTERFACE)) {
                    ExceptionInterface exceptionInterface = ((ExceptionInterface)event.getSentryInterfaces().get(ExceptionInterface.EXCEPTION_INTERFACE));
                    if (exceptionInterface.getExceptions().getFirst().getExceptionClassName().contains("JavascriptException")) {
                        return false;
                    }
                }
                return true;
            }
        });
        logger.info(String.format("startWithDsnString '%s'", dsnString));
        promise.resolve(true);
    }

    @ReactMethod
    public void deviceContexts(Promise promise) {
        EventBuilder eventBuilder = new EventBuilder();
        androidHelper.helpBuildingEvent(eventBuilder);
        Event event = eventBuilder.build();

        WritableMap params = Arguments.createMap();

        for (Map.Entry<String, Map<String, Object>> data : event.getContexts().entrySet()) {
            params.putMap(data.getKey(), MapUtil.toWritableMap(data.getValue()));
        }

        promise.resolve(params);
    }

    @ReactMethod
    public void sendEvent(ReadableMap event, Promise promise) {
        EventBuilder eventBuilder = new EventBuilder();
        androidHelper.helpBuildingEvent(eventBuilder);
        // androidHelper.buildEventFrom(eventBuilder, MapUtil.toMap(event));
        Map<String, Object> event2 = MapUtil.toMap(event);
        Sentry.capture(eventBuilder.build());
    }

    @ReactMethod
    public void setLogLevel(int level) {
        logger.setLevel(this.logLevel(level));
    }

    @ReactMethod
    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash");
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
