package io.sentry;

import com.facebook.common.logging.FLog;
import com.facebook.react.bridge.BaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
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
import java.util.Deque;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


public class RNSentryExceptionsManagerModule extends BaseJavaModule implements ExceptionsManagerModuleInterface {

    /**
     * @see com.facebook.react.modules.core.ExceptionsManagerModule#mJsModuleIdPattern
     */
    private static final Pattern mJsModuleIdPattern = Pattern.compile("(?:^|[/\\\\])(\\d+\\.js)$");

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
        convertAndCaptureReactNativeException(title, details);
        System.exit(0);
    }

    @ReactMethod
    @Override
    public void reportSoftException(String title, ReadableArray details, int exceptionId) {
        convertAndCaptureReactNativeException(title, details);
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

    private void convertAndCaptureReactNativeException(String title, ReadableArray stack) {
        FLog.e(ReactConstants.TAG, stackTraceToString(title, stack));
        StackTraceInterface stackTraceInterface = new StackTraceInterface(convertToNativeStacktrace(stack));
        Deque<SentryException> exceptions = new ArrayDeque<>();
        exceptions.push(new SentryException(title, "", "", stackTraceInterface));
        EventBuilder eventBuilder = new EventBuilder().withMessage("Unhandled JS Exception: " + title)
                .withLevel(Event.Level.FATAL)
                .withSentryInterface(new ExceptionInterface(exceptions));
        Sentry.capture(eventBuilder);
    }

    private SentryStackTraceElement[] convertToNativeStacktrace(ReadableArray stack) {
        final int stackFrameSize = stack.size();
        SentryStackTraceElement[] synthStackTrace = new SentryStackTraceElement[stackFrameSize];
        for (int i = 0; i < stackFrameSize; i++) {
            ReadableMap frame = stack.getMap(i);
            final String fileName = frame.getString("file");
            final String methodName = frame.getString("methodName");
            int lineNumber = frame.getInt("lineNumber");
            int column = 0;
            if (frame.hasKey("column") &&
                    !frame.isNull("column") &&
                    frame.getType("column") == ReadableType.Number) {
                column = frame.getInt("column");
            }
            String localFileName = new File(fileName).getName();
            String[] fileNameSegments = localFileName.split("/");
            String lastPathComponent = fileNameSegments[fileNameSegments.length-1];
            String[] lastFileNameSegments = lastPathComponent.split("\\?");
            StringBuilder finalFileName = new StringBuilder("app:///").append(lastFileNameSegments[0]);

            SentryStackTraceElement stackFrame = new SentryStackTraceElement("", methodName, stackFrameToModuleId(frame), lineNumber, column, finalFileName.toString(), "javascript");
            synthStackTrace[i] = stackFrame;
        }
        return synthStackTrace;
    }

}
