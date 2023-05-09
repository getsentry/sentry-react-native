package com.samplenewarchitecture;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;

public class SamplePackage implements ReactPackage {

    private static final ILogger logger = new AndroidLogger("SamplePackage");

    static {
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            System.loadLibrary("appmodules");
        }
    }

    public native void crash();

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(
            ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();

        modules.add(new AssetsModule(reactContext));

        modules.add(new ReactContextBaseJavaModule() {
            @Override public String getName() {
                return "CppModule";
            }

            @ReactMethod public void crashCpp() {
                if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
                    crash();
                } else {
                    logger.log(SentryLevel.WARNING, "Enable RNNA to try this.");
                }
            }
        });

        return modules;
    }

}
