import * as React from 'react';
import { UIManager, View, ViewProps } from 'react-native';
import { logger } from '@sentry/utils';

import { ReactNativeLibraries } from '../utils/rnlibraries';
import { HostComponent } from '../vendor/react-native';

function requireNativeComponent<T>(viewName: string): HostComponent<T> | null {
  if (!UIManager.hasViewManagerConfig) {
    logger.warn(`[SentrySessionReplay] Can't load ${viewName}. UIManager.hasViewManagerConfig is not available`);
    return null;
  }

  if (!UIManager.hasViewManagerConfig(viewName)) {
    logger.warn(`[SentrySessionReplay] Can't load ${viewName}. UIManager.hasViewManagerConfig(${viewName}) is not available`);
    return null;
  }

  if (!ReactNativeLibraries.ReactNative?.requireNativeComponent) {
    logger.warn(`[SentrySessionReplay] Can't load ${viewName}. requireNativeComponent from 'react-native' is not available`);
    return null;
  }

  return ReactNativeLibraries.ReactNative.requireNativeComponent<T>(viewName);
}

const NativeSentryMask = requireNativeComponent<ViewProps>('RNSentryReplayMask');
const NativeSentryUnmask = requireNativeComponent<ViewProps>('RNSentryReplayUnmask');

const FallbackSentryMask = (props: ViewProps) => <View {...props} />;
const FallbackSentryUnmask = (props: ViewProps) => <View {...props} />;

export const SentryMask = NativeSentryMask || FallbackSentryMask;
export const SentryUnmask = NativeSentryUnmask || FallbackSentryUnmask;
