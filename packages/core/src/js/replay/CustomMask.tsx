import { logger } from '@sentry/core';
import * as React from 'react';
import type { HostComponent, ViewProps } from 'react-native';
import { UIManager, View } from 'react-native';

import { isExpoGo } from '../utils/environment';

const NativeComponentRegistry: {
  get<T, C extends Record<string, unknown>>(componentName: string, createViewConfig: () => C): HostComponent<T>;
// eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('react-native/Libraries/NativeComponent/NativeComponentRegistry');

const MaskNativeComponentName = 'RNSentryReplayMask';
const UnmaskNativeComponentName = 'RNSentryReplayUnmask';

const warnMessage = (component: string): string => `[SentrySessionReplay] ${component} component is not supported on the current platform. If ${component} should be supported, please ensure that the application build is up to date.`;

const warn = (component: string): void => {
  setTimeout(() => {
    // Missing mask component could cause leaking PII, we have to ensure that the warning is visible
    // even if the app is running without debug.
    // eslint-disable-next-line no-console
    console.warn(warnMessage(component));
  }, 0);
};

const MaskFallback = (viewProps: ViewProps): React.ReactElement => {
  warn('Mask');
  return <View {...viewProps} />;
};

const UnmaskFallback = (viewProps: ViewProps): React.ReactElement => {
  warn('Unmask');
  return <View {...viewProps} />;
};

const hasViewManagerConfig = (nativeComponentName: string): boolean => UIManager.hasViewManagerConfig && UIManager.hasViewManagerConfig(nativeComponentName);

const Mask = ((): HostComponent<ViewProps> | React.ComponentType<ViewProps> => {
  if (isExpoGo() || !hasViewManagerConfig(MaskNativeComponentName)) {
    logger.warn(`[SentrySessionReplay] Can't load ${MaskNativeComponentName}.`);
    return MaskFallback;
  }

  // Based on @react-native/babel-plugin-codegen output
  // https://github.com/facebook/react-native/blob/b32c6c2cc1bc566a85a883901dbf5e23b5a75b61/packages/react-native-codegen/src/generators/components/GenerateViewConfigJs.js#L139
  return NativeComponentRegistry.get(MaskNativeComponentName, () => ({
    uiViewClassName: MaskNativeComponentName,
  }));
})()

const Unmask = ((): HostComponent<ViewProps> | React.ComponentType<ViewProps> => {
  if (isExpoGo() || !hasViewManagerConfig(UnmaskNativeComponentName)) {
    logger.warn(`[SentrySessionReplay] Can't load ${UnmaskNativeComponentName}.`);
    return UnmaskFallback;
  }

  // Based on @react-native/babel-plugin-codegen output
  // https://github.com/facebook/react-native/blob/b32c6c2cc1bc566a85a883901dbf5e23b5a75b61/packages/react-native-codegen/src/generators/components/GenerateViewConfigJs.js#L139
  return NativeComponentRegistry.get(UnmaskNativeComponentName, () => ({
    uiViewClassName: UnmaskNativeComponentName,
  }));
})();

export { Mask, Unmask, MaskFallback, UnmaskFallback };
