package io.sentry.react.expo;

import android.content.Context;
import expo.modules.core.interfaces.Package;
import expo.modules.core.interfaces.ReactNativeHostHandler;
import java.util.Collections;
import java.util.List;

/**
 * Expo package that registers {@link SentryReactNativeHostHandler} to capture native exceptions
 * swallowed by Expo's bridgeless error handling.
 *
 * <p>This package is auto-discovered by Expo's autolinking system when {@code @sentry/react-native}
 * is installed in an Expo project. It is not used in non-Expo React Native projects.
 */
public class SentryExpoPackage implements Package {

  @Override
  public List<? extends ReactNativeHostHandler> createReactNativeHostHandlers(Context context) {
    return Collections.singletonList(new SentryReactNativeHostHandler());
  }
}
