package io.sentry.react;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;
import io.sentry.react.replay.RNSentryReplayMaskManager;
import io.sentry.react.replay.RNSentryReplayMaskManagerImpl;
import io.sentry.react.replay.RNSentryReplayUnmaskManager;
import io.sentry.react.replay.RNSentryReplayUnmaskManagerImpl;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RNSentryPackage extends TurboReactPackage {

  private static final boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;

  static {
    // Load `libsentry-tm-perf-logger.so` as early as possible — its
    // `JNI_OnLoad` installs Sentry's `facebook::react::NativeModulePerfLogger`
    // into React Native so the SDK observes every TurboModule lifecycle event.
    //
    // The library is only built under New Architecture (see `build.gradle` and
    // `CMakeLists.txt`). On Old Architecture there is no TurboModule perf
    // logger to install, so a missing `.so` is expected and we swallow the
    // `UnsatisfiedLinkError` instead of crashing the host.
    try {
      System.loadLibrary("sentry-tm-perf-logger");
    } catch (UnsatisfiedLinkError e) {
      // Expected on Old Arch and on hosts that strip Sentry's native
      // libraries; the SDK keeps working with only Java-side instrumentation.
      Log.i(
          "RNSentry",
          "libsentry-tm-perf-logger.so not loaded; TurboModule perf tracking unavailable: "
              + e.getMessage());
    }
  }

  @Nullable
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (RNSentryModuleImpl.NAME.equals(name)) {
      return new RNSentryModule(reactContext);
    } else if (isTurboModule) {
      return getFabricComponentNativeModule(name);
    } else {
      return null;
    }
  }

  private NativeModule getFabricComponentNativeModule(String name) {
    if (RNSentryReplayMaskManagerImpl.REACT_CLASS.equals(name)) {
      return new RNSentryReplayMaskManager();
    } else if (RNSentryReplayUnmaskManagerImpl.REACT_CLASS.equals(name)) {
      return new RNSentryReplayUnmaskManager();
    } else {
      return null;
    }
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
      moduleInfos.put(
          RNSentryModuleImpl.NAME,
          new ReactModuleInfo(
              RNSentryModuleImpl.NAME,
              RNSentryModuleImpl.NAME,
              false, // canOverrideExistingModule
              false, // needsEagerInit
              true, // hasConstants
              false, // isCxxModule
              isTurboModule // isTurboModule
              ));
      if (isTurboModule) {
        moduleInfos.put(
            RNSentryReplayMaskManagerImpl.REACT_CLASS,
            new ReactModuleInfo(
                RNSentryReplayMaskManagerImpl.REACT_CLASS, // name
                RNSentryReplayMaskManagerImpl.REACT_CLASS, // className
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // hasConstants, required in RN 0.65
                false, // isCxxModule
                true // isTurboModule
                ));
        moduleInfos.put(
            RNSentryReplayUnmaskManagerImpl.REACT_CLASS,
            new ReactModuleInfo(
                RNSentryReplayUnmaskManagerImpl.REACT_CLASS, // name
                RNSentryReplayUnmaskManagerImpl.REACT_CLASS, // className
                false, // canOverrideExistingModule
                false, // needsEagerInit
                false, // hasConstants, required in RN 0.65
                false, // isCxxModule
                true // isTurboModule
                ));
      }
      return moduleInfos;
    };
  }

  @NonNull
  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return List.of(
        new RNSentryOnDrawReporterManager(reactContext),
        new RNSentryReplayMaskManager(),
        new RNSentryReplayUnmaskManager());
  }
}
