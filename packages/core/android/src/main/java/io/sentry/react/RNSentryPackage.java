package io.sentry.react;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.uimanager.ViewManager;
import io.sentry.react.replay.RNSentryReplayMaskManager;
import io.sentry.react.replay.RNSentryReplayUnmaskManager;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RNSentryPackage extends TurboReactPackage {

  @Nullable
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (RNSentryModuleImpl.NAME.equals(name)) {
      return new RNSentryModule(reactContext);
    } else if (RNSentryReplayMaskManager.REACT_CLASS.equals(name)) {
      return new RNSentryReplayMaskManager();
    } else if (RNSentryReplayUnmaskManager.REACT_CLASS.equals(name)) {
      return new RNSentryReplayUnmaskManager();
    } else {
      return null;
    }
  }

  @Override
  public ReactModuleInfoProvider getReactModuleInfoProvider() {
    return () -> {
      final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
      boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
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
      moduleInfos.put(
          RNSentryReplayMaskManager.REACT_CLASS,
          new ReactModuleInfo(
              RNSentryReplayMaskManager.REACT_CLASS, // name
              RNSentryReplayMaskManager.REACT_CLASS, // className
              false, // canOverrideExistingModule
              false, // needsEagerInit
              false, // isCxxModule
              true // isTurboModule
              ));
      moduleInfos.put(
          RNSentryReplayUnmaskManager.REACT_CLASS,
          new ReactModuleInfo(
              RNSentryReplayUnmaskManager.REACT_CLASS, // name
              RNSentryReplayUnmaskManager.REACT_CLASS, // className
              false, // canOverrideExistingModule
              false, // needsEagerInit
              false, // isCxxModule
              true // isTurboModule
              ));
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
