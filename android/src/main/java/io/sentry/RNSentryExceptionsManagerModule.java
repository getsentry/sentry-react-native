package io.sentry;

import com.facebook.common.logging.FLog;
import com.facebook.react.bridge.BaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableNativeArray;
import com.facebook.react.bridge.ReadableNativeMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.common.ReactConstants;
import io.sentry.Sentry;
import io.sentry.event.Event;
import io.sentry.event.EventBuilder;
import io.sentry.event.interfaces.ExceptionInterface;
import io.sentry.event.interfaces.SentryException;
import io.sentry.event.interfaces.SentryStackTraceElement;
import io.sentry.event.interfaces.StackTraceInterface;

import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public class RNSentryExceptionsManagerModule extends BaseJavaModule implements ExceptionsManagerModuleInterface {

    /**
     * @see com.facebook.react.modules.core.ExceptionsManagerModule#mJsModuleIdPattern
     */
    private static final Pattern mJsModuleIdPattern = Pattern.compile("(?:^|[/\\\\])(\\d+\\.js)$");

    static public ReadableMap lastReceivedException = null;

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * @see com.facebook.react.modules.core.ExceptionsManagerModule#stackFrameToModuleId(ReadableMap)
     */
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

    /**
     * @see com.facebook.react.modules.core.ExceptionsManagerModule#stackTraceToString(String, ReadableArray)
     */
    private static String stackTraceToString(String message, ReadableArray stack) {
        StringBuilder stringBuilder = new StringBuilder(message).append(", stack:\n");
        for (int i = 0; i < stack.size(); i++) {
            ReadableMap frame = stack.getMap(i);
            stringBuilder
                    .append(frame.getString("methodName"))
                    .append("@")
                    .append(stackFrameToModuleId(frame))
                    .append(frame.getInt("lineNumber"));
            if (frame.hasKey("column") &&
                    !frame.isNull("column") &&
                    frame.getType("column") == ReadableType.Number) {
                stringBuilder
                        .append(":")
                        .append(frame.getInt("column"));
            }
            stringBuilder.append("\n");
        }
        return stringBuilder.toString();
    }

    @Override
    public boolean canOverrideExistingModule() {
        return true;
    }

    @ReactMethod
    @Override
    public void reportFatalException(String title, ReadableArray details, int exceptionId) {
        convertAndCaptureReactNativeException(title, (ReadableNativeArray)details);
        System.exit(0);
    }

    @ReactMethod
    @Override
    public void reportSoftException(String title, ReadableArray details, int exceptionId) {
        convertAndCaptureReactNativeException(title, (ReadableNativeArray)details);
    }

    @ReactMethod
    @Override
    public void updateExceptionMessage(String title, ReadableArray details, int exceptionId) {
        // Do nothing
    }

    @ReactMethod
    @Override
    public void dismissRedbox() {
        // Do nothing
    }

    public static void convertAndCaptureReactNativeException(String title, ReadableNativeArray stack) {
        StackTraceInterface stackTraceInterface = new StackTraceInterface(convertToNativeStacktrace(stack));
        Deque<SentryException> exceptions = new ArrayDeque<>();

        String type = title;
        String value = title;
        if (null != RNSentryExceptionsManagerModule.lastReceivedException) {
            ReadableNativeArray exceptionValues = ((ReadableNativeArray)RNSentryExceptionsManagerModule.lastReceivedException.getMap("exception").getArray("values"));
            ReadableNativeMap exception = exceptionValues.getMap(0);
            type = exception.getString("type");
            value = exception.getString("value");
        }

        exceptions.push(new SentryException(value, type, "", stackTraceInterface));
        EventBuilder eventBuilder = new EventBuilder()
                .withLevel(Event.Level.FATAL)
                .withSentryInterface(new ExceptionInterface(exceptions));
        Sentry.capture(RNSentryModule.buildEvent(eventBuilder));
    }

    private static SentryStackTraceElement[] convertToNativeStacktrace(ReadableNativeArray stack) {
        final int stackFrameSize = stack.size();
        SentryStackTraceElement[] synthStackTrace = new SentryStackTraceElement[stackFrameSize];
        for (int i = 0; i < stackFrameSize; i++) {
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
            StringBuilder finalFileName = new StringBuilder("app:///").append(fileNameSegments[fileNameSegments.length-1]);

            SentryStackTraceElement stackFrame = new SentryStackTraceElement("", methodName, stackFrameToModuleId(frame), lineNumber, column, finalFileName.toString(), "javascript");
            synthStackTrace[i] = stackFrame;
        }
        return synthStackTrace;
    }

}
