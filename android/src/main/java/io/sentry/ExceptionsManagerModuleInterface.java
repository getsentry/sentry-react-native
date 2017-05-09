package io.sentry;

import com.facebook.react.bridge.ReadableArray;

public interface ExceptionsManagerModuleInterface {

    String MODULE_NAME = "RKExceptionsManager";

    void reportFatalException(String title, ReadableArray details, int exceptionId);

    void reportSoftException(String title, ReadableArray details, int exceptionId);

    void updateExceptionMessage(String title, ReadableArray details, int exceptionId);

    void dismissRedbox();

}