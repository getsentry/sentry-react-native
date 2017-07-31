package io.sentry;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashMap;
import java.util.Map;

public class RNSentryEventEmitter extends ReactContextBaseJavaModule {

    public static final String SENTRY_EVENT_SENT_SUCCESSFULLY = "Sentry/eventSentSuccessfully";
    public static final String SENTRY_EVENT_STORED = "Sentry/eventStored";

    public RNSentryEventEmitter(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "RNSentryEventEmitter";
    }

    @Override
    public Map<String, Object> getConstants() {
        final Map<String, Object> constants = new HashMap<>();
        constants.put("EVENT_SENT_SUCCESSFULLY", SENTRY_EVENT_SENT_SUCCESSFULLY);
        constants.put("EVENT_STORED", SENTRY_EVENT_STORED);
        return constants;
    }

    public static void sendEvent(ReactApplicationContext reactContext, String eventName, WritableMap params) {
        reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(eventName, params);
    }

}
