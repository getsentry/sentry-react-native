import { logger } from '@sentry/utils';
import * as React from 'react';
import type { HostComponent, ViewProps } from 'react-native';
import { UIManager, View } from 'react-native';

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
  if (!hasViewManagerConfig(MaskNativeComponentName)) {
    logger.warn(`[SentrySessionReplay] Can't load ${MaskNativeComponentName}.`);
    return MaskFallback;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  return require('../RNSentryReplayMaskNativeComponent').default;
})()

const Unmask = ((): HostComponent<ViewProps> | React.ComponentType<ViewProps> => {
  if (!hasViewManagerConfig(UnmaskNativeComponentName)) {
    logger.warn(`[SentrySessionReplay] Can't load ${UnmaskNativeComponentName}.`);
    return UnmaskFallback;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
  return require('../RNSentryReplayUnmaskNativeComponent').default;
})();

export { Mask, Unmask };
