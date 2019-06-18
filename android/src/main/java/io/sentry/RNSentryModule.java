package io.sentry;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.annotation.NonNull;

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
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import io.sentry.android.AndroidSentryClientFactory;
import io.sentry.android.event.helper.AndroidEventBuilderHelper;
import io.sentry.connection.EventSendCallback;
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

public class RNSentryModule extends ReactContextBaseJavaModule {

    private static final Pattern mJsModuleIdPattern = Pattern.compile("(?:^|[/\\\\])(\\d+\\.js)$");
    private static final String versionString = "0.43.2";
    private static final String sdkName = "sentry-react-native";

    private final ReactApplicationContext reactContext;

    private static AndroidEventBuilderHelper androidHelper;
    private static PackageInfo packageInfo;
    final static Logger logger = Logger.getLogger("react-native-sentry");
    private static Map<String, Object> extra;
    private static ReadableMap tags;
    private static SentryClient sentryClient;

    public RNSentryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        RNSentryModule.extra = new HashMap<>();
        RNSentryModule.packageInfo = getPackageInfo(reactContext);
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
        sentryClient.addEventSendCallback(new EventSendCallback() {
            @Override
            public void onFailure(Event event, Exception exception) {
                // This needs to be there, otherwise in case of no internet the users app will not
                // crash since we do not propagate the error further. The system needs to be
                // overhauled to remove this "hack".
                RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_STORED, new WritableNativeMap());
                RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_SENT_SUCCESSFULLY, new WritableNativeMap());
            }

            @Override
            public void onSuccess(Event event) {
                WritableMap params = Arguments.createMap();
                params.putString("event_id", event.getId().toString());
                params.putString("level", event.getLevel().toString().toLowerCase());
                params.putString("message", event.getMessage());
                params.putString("release", event.getRelease());
                params.putString("dist", event.getDist());
                params.putMap("extra", MapUtil.toWritableMap(event.getExtra()));
                params.putMap("tags", MapUtil.toWritableMap(Collections.<String, Object>unmodifiableMap(event.getTags())));
                if (event.getSentryInterfaces().containsKey(ExceptionInterface.EXCEPTION_INTERFACE)) {
                    ExceptionInterface exceptionInterface = ((ExceptionInterface)event.getSentryInterfaces().get(ExceptionInterface.EXCEPTION_INTERFACE));
                    params.putString("message", exceptionInterface.getExceptions().getFirst().getExceptionMessage());
                }
                RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_STORED, new WritableNativeMap());
                RNSentryEventEmitter.sendEvent(reactContext, RNSentryEventEmitter.SENTRY_EVENT_SENT_SUCCESSFULLY, params);
            }
        });
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
                // Since we set shouldSendEvent for react-native we need to duplicate the code for sampling here
                // I know you could add multiple shouldSendCallbacks but I want to be consistent with ios
                if (options.hasKey("sampleRate")) {
                    double randomDouble = new Random().nextDouble();
                    return options.getDouble("sampleRate") >= Math.abs(randomDouble);
                }
                return true;
            }
        });
        logger.info(String.format("startWithDsnString '%s'", dsnString));
        promise.resolve(true);
    }

    @ReactMethod
    public void setLogLevel(int level) {
        logger.setLevel(this.logLevel(level));
    }

    @ReactMethod
    public void setExtra(ReadableMap extra) {
        Map<String, Object> extraMap = MapUtil.toMap(extra);
        RNSentryModule.extra.putAll(extraMap);
    }

    @ReactMethod
    public void addExtra(String key, String value) {
        RNSentryModule.extra.put(key, value);
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
        Sentry.setUser(builtUser);
    }

    @ReactMethod
    public void crash() {
        throw new RuntimeException("TEST - Sentry Client Crash");
    }

    @ReactMethod
    public void captureBreadcrumb(ReadableMap breadcrumb) {
        logger.info(String.format("captureEvent '%s'", breadcrumb));

        BreadcrumbBuilder breadcrumbBuilder = new BreadcrumbBuilder();
        if (breadcrumb.hasKey("category")) {
            breadcrumbBuilder.setCategory(breadcrumb.getString("category"));
        }
        if (breadcrumb.hasKey("data") && breadcrumb.getMap("data") != null) {
            Map<String, String> newData = new HashMap<>();
            for (Map.Entry<String, Object> data : ((ReadableNativeMap)breadcrumb.getMap("data")).toHashMap().entrySet()) {
                newData.put(data.getKey(), data.getValue() != null ? data.getValue().toString() : null);
            }
            breadcrumbBuilder.setData(newData);
        }
        breadcrumbBuilder.setLevel(breadcrumbLevel((ReadableNativeMap)breadcrumb));

        if (breadcrumb.hasKey("message")) {
            breadcrumbBuilder.setMessage(breadcrumb.getString("message"));
        } else {
            breadcrumbBuilder.setMessage("");
        }
        Sentry.record(breadcrumbBuilder.build());
    }

    @ReactMethod
    public void captureEvent(ReadableMap event) {
        ReadableNativeMap castEvent = (ReadableNativeMap)event;

        EventBuilder eventBuilder = new EventBuilder()
                .withLevel(eventLevel(castEvent));

        if (event.hasKey("message")) {
            eventBuilder.withMessage(event.getString("message"));
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

        if (event.hasKey("environment")) {
            eventBuilder.withEnvironment(event.getString("environment"));
        }

        Sentry.capture(buildEvent(eventBuilder));
    }

    @ReactMethod
    public void clearContext() {
        Sentry.clearContext();
        RNSentryModule.extra = new HashMap<>();
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
        } else if (user.hasKey("userId")) {
            userBuilder.setId(user.getString("userId"));
        } else if (user.hasKey("id")) {
            userBuilder.setId(user.getString("id"));
        }
        if (user.hasKey("username")) {
            userBuilder.setUsername(user.getString("username"));
        }
        if (user.hasKey("extra")) {
            userBuilder.setData(((ReadableNativeMap)user.getMap("extra")).toHashMap());
        }
        return userBuilder;
    }

    public static Event buildEvent(EventBuilder eventBuilder) {
        androidHelper.helpBuildingEvent(eventBuilder);

        setRelease(eventBuilder);
        eventBuilder.withBreadcrumbs(Sentry.getStoredClient().getContext().getBreadcrumbs());

        if (extra != null) {
            for (Map.Entry<String, Object> entry : extra.entrySet()) {
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

        Event event = eventBuilder.build();
        Set<String> sdkIntegrations = new HashSet<>();
        sdkIntegrations.add("sentry-java");
        event.setSdk(new Sdk(sdkName, versionString, sdkIntegrations));
        return event;
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

            String[] lastFileNameSegments = fileName.split("\\?");
            String lastPathComponent = lastFileNameSegments[0];
            String[] fileNameSegments = lastPathComponent.split("/");
            String calculatedFileName = fileNameSegments[fileNameSegments.length-1];
            StringBuilder finalFileName = new StringBuilder("app:///").append(calculatedFileName);

            // We want to skip native code frames without function
            if (methodName.equals("?") && calculatedFileName.equals("[native code]")) {
                continue;
            }

            // We remove the url and add native code the method name so its in the stacktrace
            // but not
            if (calculatedFileName.equals("[native code]")) {
                finalFileName = new StringBuilder("");
                methodName = new StringBuilder("[native code] ").append(methodName).toString();
            }

            SentryStackTraceElement stackFrame = new SentryStackTraceElement("", methodName, stackFrameToModuleId(frame), lineNumber, column, finalFileName.toString(), "javascript");
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

    private static void setRelease(EventBuilder eventBuilder) {
        if (extra.containsKey("__sentry_version")) {
            eventBuilder.withRelease(packageInfo.packageName + "-" + extra.get("__sentry_version"));
            eventBuilder.withDist(null);
        }
        if (extra.containsKey("__sentry_release")) {
            eventBuilder.withRelease((String) extra.get("__sentry_release"));
        }
        if (extra.containsKey("__sentry_dist")) {
            eventBuilder.withDist((String) extra.get("__sentry_dist"));
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
