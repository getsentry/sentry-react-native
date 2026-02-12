package io.sentry.reactnative.sample;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.uimanager.ViewManager;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.AndroidLogger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();

    modules.add(new AssetsModule(reactContext));

    modules.add(
        new ReactContextBaseJavaModule() {
          @Override
          public String getName() {
            return "CppModule";
          }

          @ReactMethod
          public void crashCpp() {
            if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
              crash();
            } else {
              logger.log(SentryLevel.WARNING, "Enable RNNA to try this.");
            }
          }
        });

    modules.add(
        new ReactContextBaseJavaModule() {
          @Override
          public String getName() {
            return "CrashModule";
          }

          @ReactMethod
          public void crashOrUndefined() {
            this.crashNow();
          }

          @ReactMethod
          public void crashOrNumber(Promise promise) {
            this.crashNow();
            promise.resolve(42);
          }

          private void crashNow() {
            throw new RuntimeException("CrashModule.crashNow()");
          }
        });

    modules.add(
        new ReactContextBaseJavaModule(reactContext) {
          @Override
          public String getName() {
            return "TestControlModule";
          }

          @ReactMethod
          public void enableCrashOnStart(Promise promise) {
            try {
              // Create flag file to trigger crash on next app start
              getReactApplicationContext()
                  .openFileOutput(".sentry_crash_on_start", ReactApplicationContext.MODE_PRIVATE)
                  .close();
              promise.resolve(true);
            } catch (Exception e) {
              promise.reject("ERROR", "Failed to enable crash on start", e);
            }
          }

          @ReactMethod
          public void disableCrashOnStart(Promise promise) {
            try {
              // Delete flag file
              getReactApplicationContext().deleteFile(".sentry_crash_on_start");
              promise.resolve(true);
            } catch (Exception e) {
              promise.reject("ERROR", "Failed to disable crash on start", e);
            }
          }
        });

    return modules;
  }
}
