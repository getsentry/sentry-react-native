import * as React from 'react';
import type { HostComponent } from 'react-native';
import { UIManager, View } from 'react-native';

import { ReactNativeLibraries } from '../utils/rnlibraries';
import type { RNSentryOnDrawReporterProps } from './timetodisplaynative.types';

const RNSentryOnDrawReporterClass = 'RNSentryOnDrawReporter';

export const nativeComponentExists = UIManager.hasViewManagerConfig
  ? UIManager.hasViewManagerConfig(RNSentryOnDrawReporterClass)
  : false;

/**
 * This is a fallback component for environments where the native component is not available.
 */
class RNSentryOnDrawReporterNoop extends React.Component<RNSentryOnDrawReporterProps> {
  public render(): React.ReactNode {
    return (
      <View {...this.props} />
    );
  }
}

let RNSentryOnDrawReporter: HostComponent<RNSentryOnDrawReporterProps> | typeof RNSentryOnDrawReporterNoop;

/**
 * Native component that reports the on draw timestamp.
 */
export const getRNSentryOnDrawReporter = (): typeof RNSentryOnDrawReporter => {
  if (!RNSentryOnDrawReporter) {
    RNSentryOnDrawReporter = nativeComponentExists && ReactNativeLibraries.ReactNative?.requireNativeComponent
      ? ReactNativeLibraries.ReactNative.requireNativeComponent(RNSentryOnDrawReporterClass)
      : RNSentryOnDrawReporterNoop;
  }
  return RNSentryOnDrawReporter;
}
