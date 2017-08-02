
package io.sentry;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.facebook.react.bridge.JavaScriptModule;

public class RNSentryPackage implements ReactPackage {

    private final ReactApplication reactApplication;

    public RNSentryPackage(ReactApplication reactApplication) {
        this.reactApplication = reactApplication;
    }

    public ReactApplication getReactApplication() {
        return reactApplication;
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Arrays.<NativeModule>asList(new RNSentryModule(reactContext, this.getReactApplication()), new RNSentryEventEmitter(reactContext));
    }

    public List<Class<? extends JavaScriptModule>> createJSModules() {
        return Collections.emptyList();
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
