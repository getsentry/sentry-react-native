package io.sentry;

import com.facebook.common.logging.FLog;
import com.facebook.react.bridge.BaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.common.ReactConstants;
import com.getsentry.raven.Raven;

import java.util.ArrayList;
import java.util.List;
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
        List<StackTraceElement> synthStackTrace = convertToNativeStacktrace(stack);

        StackTraceElement[] stackTrace = synthStackTrace.toArray(new StackTraceElement[synthStackTrace.size()]);
        ReactNativeException reactNativeException = new ReactNativeException(title);
        reactNativeException.setStackTrace(stackTrace);
        Raven.capture(reactNativeException);
    }

    private List<StackTraceElement> convertToNativeStacktrace(ReadableArray stack) {
        final int stackFrameSize = stack.size();
        List<StackTraceElement> synthStackTrace = new ArrayList<>(stackFrameSize);
        for (int i = 0; i < stackFrameSize; i++) {
            ReadableMap frame = stack.getMap(i);
            final String className = "";
            final String fileName = frame.getString("file");
            final String methodName = frame.getString("methodName");
            final String lineNumber = stackFrameToModuleId(frame) + frame.getInt("lineNumber");
            int column = 0;
            if (frame.hasKey("column") &&
                    !frame.isNull("column") &&
                    frame.getType("column") == ReadableType.Number) {
                column = frame.getInt("column");
            }

            // TODO add colum
            // (String cls, String method, String file, int line)
            StackTraceElement stackFrame = new StackTraceElement(className, methodName,
                    fileName, frame.getInt("lineNumber"));
            synthStackTrace.add(stackFrame);
        }
        return synthStackTrace;
    }

}
