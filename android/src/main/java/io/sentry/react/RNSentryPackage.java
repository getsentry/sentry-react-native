package io.sentry.react;

import androidx.annotation.Nullable;

import java.util.HashMap;
import java.util.Map;

import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;
import com.facebook.react.TurboReactPackage;

public class RNSentryPackage extends TurboReactPackage {

  @Nullable
  @Override
  public NativeModule getModule(String name, ReactApplicationContext reactContext) {
    if (name.equals(RNSentryModuleImpl.NAME)) {
      return new RNSentryModule(reactContext);
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
      return moduleInfos;
    };
  }

}
