package io.sentry;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableNativeArray;
import com.facebook.react.bridge.ReadableNativeMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.bridge.UnexpectedNativeTypeException;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;

import java.util.UUID;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.sentry.android.AndroidSentryClientFactory;
import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.event.Breadcrumb;
import io.sentry.event.BreadcrumbBuilder;
import io.sentry.event.Event;
import io.sentry.event.EventBuilder;
import io.sentry.event.Sdk;
import io.sentry.event.User;
import io.sentry.event.UserBuilder;
import io.sentry.event.helper.ShouldSendEventCallback;
import io.sentry.event.interfaces.ExceptionInterface;
import io.sentry.event.interfaces.SentryException;
import io.sentry.event.interfaces.SentryStackTraceElement;
import io.sentry.event.interfaces.StackTraceInterface;
import io.sentry.event.interfaces.UserInterface;

@ReactModule(name = RNSentryModule.NAME)
public class RNSentryModule extends ReactContextBaseJavaModule {

    public static final String NAME = "RNSentry";

    private static final Pattern mJsModuleIdPattern = Pattern.compile("(?:^|[/\\\\])(\\d+\\.js)$");

    private static AndroidEventBuilderHelper androidHelper;

    final static Logger logger = Logger.getLogger("react-native-sentry");
    private static SentryClient sentryClient;
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
        if (options.hasKey("environment") && options.getString("environment") != null) {
            sentryClient.environment = options.getString("environment");
        }
        if (options.hasKey("release") && options.getString("release") != null) {
            sentryClient.release = options.getString("release");
        }
        if (options.hasKey("dist") && options.getString("dist") != null) {
            sentryClient.dist = options.getString("dist");
        }
        logger.info(String.format("startWithDsnString '%s'", dsnString));
        promise.resolve(true);
    }

    @ReactMethod
    public void setLogLevel(int level) {
        logger.setLevel(this.logLevel(level));
    }

    @ReactMethod
    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash");
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
    public void extraUpdated(ReadableMap extra) {
        if (extra.hasKey("__sentry_release")) {
            sentryClient.release = extra.getString("__sentry_release");
        }
        if (extra.hasKey("__sentry_dist")) {
            sentryClient.dist = extra.getString("__sentry_dist");
        }
    }

    @ReactMethod
    public void sendEvent(ReadableMap event, Promise promise) {
        ReadableNativeMap castEvent = (ReadableNativeMap)event;

//        EventBuilder eventBuilder = new EventBuilder()
//                .withLevel(eventLevel(castEvent));

        EventBuilder eventBuilder;
        if (event.hasKey("event_id")) {
            UUID eventId = UUID.fromString(event.getString("event_id").replaceFirst(
                    "(\\p{XDigit}{8})(\\p{XDigit}{4})(\\p{XDigit}{4})(\\p{XDigit}{4})(\\p{XDigit}+)",
                    "$1-$2-$3-$4-$5"));
            eventBuilder = new EventBuilder(eventId).withLevel(eventLevel(castEvent));
        } else {
            logger.info("Event has no event_id");
            eventBuilder = new EventBuilder().withLevel(eventLevel(castEvent));
        }

        androidHelper.helpBuildingEvent(eventBuilder);

        if (event.hasKey("breadcrumbs")) {
            ReadableNativeArray breadcrumbs = (ReadableNativeArray)event.getArray("breadcrumbs");
            ArrayList<Breadcrumb> eventBreadcrumbs = new ArrayList<Breadcrumb>();
            for (int i = 0; i < breadcrumbs.size(); i++) {
                ReadableNativeMap breadcrumb = breadcrumbs.getMap(i);
                BreadcrumbBuilder breadcrumbBuilder = new BreadcrumbBuilder();
                if (breadcrumb.hasKey("category")) {
                    breadcrumbBuilder.setCategory(breadcrumb.getString("category"));
                }

                if (breadcrumb.hasKey("type") && breadcrumb.getString("type") != null) {
                    String typeString = breadcrumb.getString("type").toUpperCase();
                    try {
                        breadcrumbBuilder.setType(Breadcrumb.Type.valueOf(typeString));
                    } catch (IllegalArgumentException e) {
                        //don't copy over invalid breadcrumb 'type' value
                    }
                }

                if (breadcrumb.hasKey("level") && breadcrumb.getString("level") != null) {
                    String levelString = breadcrumb.getString("level").toUpperCase();
                    try {
                        breadcrumbBuilder.setLevel(Breadcrumb.Level.valueOf(levelString));
                    } catch (IllegalArgumentException e) {
                        //don't copy over invalid breadcrumb 'level' value
                    }
                }

                try {
                    if (breadcrumb.hasKey("data") && breadcrumb.getMap("data") != null) {
                        Map<String, String> newData = new HashMap<>();
                        for (Map.Entry<String, Object> data : breadcrumb.getMap("data").toHashMap().entrySet()) {
                            newData.put(data.getKey(), data.getValue() != null ? data.getValue().toString() : null);
                        }

                        // in case a `status_code` entry got accidentally stringified as a float
                        if (newData.containsKey("status_code")) {
                              String value = newData.get("status_code");
                              newData.put(
                                  "status_code",
                                  value.endsWith(".0") ? value.replace(".0", "") : value
                              );
                        }

                        breadcrumbBuilder.setData(newData);
                    }
                } catch (UnexpectedNativeTypeException e) {
                    logger.warning("Discarded breadcrumb.data since it was not an object");
                } catch (ClassCastException e) { // This needs to be here for RN < 0.60
                    logger.warning("Discarded breadcrumb.data since it was not an object");
                }

                if (breadcrumb.hasKey("message")) {
                    breadcrumbBuilder.setMessage(breadcrumb.getString("message"));
                } else {
                    breadcrumbBuilder.setMessage("");
                }
                eventBreadcrumbs.add(i, breadcrumbBuilder.build());
            }
            if (eventBreadcrumbs.size() > 0) {
                eventBuilder.withBreadcrumbs(eventBreadcrumbs);
            }
        }

        if (event.hasKey("message")) {
            String message = "";
            try {
                message = event.getString("message");
            } catch (UnexpectedNativeTypeException e) {
                // Do nothing
            } catch (ClassCastException e) { // This needs to be here for RN < 0.60
                // Do nothing
            } finally {
                try {
                    message = event.getMap("message").toString();
                } catch (UnexpectedNativeTypeException e) {
                    // Do nothing
                } catch (ClassCastException e) { // This needs to be here for RN < 0.60
                    // Do nothing
                }
            }
            eventBuilder.withMessage(message);
        }

        if (event.hasKey("logger")) {
            eventBuilder.withLogger(event.getString("logger"));
        }

        if (event.hasKey("user")) {
            UserBuilder userBuilder = getUserBuilder(event.getMap("user"));
            User builtUser = userBuilder.build();
            UserInterface userInterface = new UserInterface(
                    builtUser.getId(),
                    builtUser.getUsername(),
                    null,
                    builtUser.getEmail(),
                    builtUser.getData()
            );
            eventBuilder.withSentryInterface(userInterface);
        }

        if (castEvent.hasKey("extra")) {
            for (Map.Entry<String, Object> entry : castEvent.getMap("extra").toHashMap().entrySet()) {
                eventBuilder.withExtra(entry.getKey(), entry.getValue());
            }
        }

        if (event.hasKey("fingerprint")) {
            ReadableArray fingerprint = event.getArray("fingerprint");
            ArrayList<String> print = new ArrayList<String>(fingerprint.size());
            for(int i = 0; i < fingerprint.size(); ++i) {
                print.add(i, fingerprint.getString(i));
            }
            eventBuilder.withFingerprint(print);
        }

        if (castEvent.hasKey("tags")) {
            for (Map.Entry<String, Object> entry : castEvent.getMap("tags").toHashMap().entrySet()) {
                String tagValue = entry.getValue() != null ? entry.getValue().toString() : "INVALID_TAG";
                eventBuilder.withTag(entry.getKey(), tagValue);
            }
        }

        if (event.hasKey("exception")) {
            ReadableNativeArray exceptionValues = (ReadableNativeArray)event.getMap("exception").getArray("values");
            ReadableNativeMap exception = exceptionValues.getMap(0);
            if (exception.hasKey("stacktrace")) {
                ReadableNativeMap stacktrace = exception.getMap("stacktrace");
                // temporary solution until final fix
                // https://github.com/getsentry/sentry-react-native/issues/742
                if (stacktrace.hasKey("frames")) {
                    ReadableNativeArray frames = (ReadableNativeArray)stacktrace.getArray("frames");
                    if (exception.hasKey("value")) {
                        addExceptionInterface(eventBuilder, exception.getString("type"), exception.getString("value"), frames);
                    } else {
                        // We use type/type here since this indicates an Unhandled Promise Rejection
                        // https://github.com/getsentry/react-native-sentry/issues/353
                        addExceptionInterface(eventBuilder, exception.getString("type"), exception.getString("type"), frames);
                    }
                }
            }
        }

        if (event.hasKey("environment")) {
            eventBuilder.withEnvironment(event.getString("environment"));
        }


        if (event.hasKey("release")) {
            eventBuilder.withRelease(event.getString("release"));
        } else {
            eventBuilder.withRelease(null);
        }

        if (event.hasKey("dist")) {
            eventBuilder.withDist(event.getString("dist"));
        } else {
            eventBuilder.withDist(null);
        }

        Event builtEvent = eventBuilder.build();

        if (event.hasKey("sdk")) {
            ReadableNativeMap sdk = (ReadableNativeMap)event.getMap("sdk");
            Set<String> sdkIntegrations = new HashSet<>();
            if (sdk.hasKey("integrations")) {
                ReadableNativeArray integrations = (ReadableNativeArray)sdk.getArray("integrations");
                for(int i = 0; i < integrations.size(); ++i) {
                    sdkIntegrations.add(integrations.getString(i));
                }
            }
            builtEvent.setSdk(new Sdk(sdk.getString("name"), sdk.getString("version"), sdkIntegrations));
        }


        Sentry.capture(builtEvent);
        promise.resolve(true);
    }

    private UserBuilder getUserBuilder(ReadableMap user) {
        UserBuilder userBuilder = new UserBuilder();
        if (user.hasKey("email")) {
            userBuilder.setEmail(user.getString("email"));
        }
        if (user.hasKey("userID")) {
            userBuilder.setId(user.getString("userID"));
        } else if (user.hasKey("userId")) {
            userBuilder.setId(user.getString("userId"));
        } else if (user.hasKey("id")) {
            userBuilder.setId(user.getString("id"));
        }
        if (user.hasKey("username")) {
            userBuilder.setUsername(user.getString("username"));
        }
        if (user.hasKey("extra")) {
            userBuilder.setData(user.getMap("extra").toHashMap());
        }
        return userBuilder;
    }

    private static void addExceptionInterface(EventBuilder eventBuilder, String type, String value, ReadableNativeArray stack) {
        StackTraceInterface stackTraceInterface = new StackTraceInterface(convertToNativeStacktrace(stack));
        Deque<SentryException> exceptions = new ArrayDeque<>();

        exceptions.push(new SentryException(value, type, "", stackTraceInterface));

        eventBuilder.withSentryInterface(new ExceptionInterface(exceptions));
    }

    private static SentryStackTraceElement[] convertToNativeStacktrace(ReadableNativeArray stack) {
        Deque<SentryStackTraceElement> frames = new ArrayDeque<>();
        for (int i = 0; i < stack.size(); i++) {
            ReadableNativeMap frame = stack.getMap(i);

            String fileName = "";
            if (frame.hasKey("file")) {
                fileName = frame.getString("file");
            } else if (frame.hasKey("filename")) {
                fileName = frame.getString("filename");
            }

            String methodName = "";
            if (frame.hasKey("methodName")) {
                methodName = frame.getString("methodName");
            } else if (frame.hasKey("function")) {
                methodName = frame.getString("function");
            }

            int lineNumber = 0;
            if (frame.hasKey("lineNumber") &&
                    !frame.isNull("lineNumber") &&
                    frame.getType("lineNumber") == ReadableType.Number) {
                lineNumber = frame.getInt("lineNumber");
            } else if (frame.hasKey("lineno") &&
                    !frame.isNull("lineno") &&
                    frame.getType("lineno") == ReadableType.Number) {
                lineNumber = frame.getInt("lineno");
            }

            int column = 0;
            if (frame.hasKey("column") &&
                    !frame.isNull("column") &&
                    frame.getType("column") == ReadableType.Number) {
                column = frame.getInt("column");
            } else if (frame.hasKey("colno") &&
                    !frame.isNull("colno") &&
                    frame.getType("colno") == ReadableType.Number) {
                column = frame.getInt("colno");
            }

            SentryStackTraceElement stackFrame = new SentryStackTraceElement("", methodName, stackFrameToModuleId(frame), lineNumber, column, fileName, "javascript");
            frames.add(stackFrame);
        }
        SentryStackTraceElement[] synthStackTrace = new SentryStackTraceElement[frames.size()];
        Iterator<SentryStackTraceElement> iterator = frames.descendingIterator();
        int i = 0;
        while (iterator.hasNext()) {
            synthStackTrace[i] = iterator.next();
            i++;
        }
        return synthStackTrace;
    }

    private static String stackFrameToModuleId(ReadableMap frame) {
        if (frame.hasKey("file") &&
                !frame.isNull("file") &&
                frame.getType("file") == ReadableType.String) {
            final Matcher matcher = mJsModuleIdPattern.matcher(frame.getString("file"));
            if (matcher.find()) {
                return matcher.group(1) + ":";
            }
        }
        return "";
    }

    private static PackageInfo getPackageInfo(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            logger.info("Error getting package info.");
            return null;
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
