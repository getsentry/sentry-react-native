import type { HostComponent } from 'react-native';

import * as React from 'react';
import { UIManager, View } from 'react-native';

import type { RNSentryOnDrawReporterProps } from './timetodisplaynative.types';

import { isExpoGo } from '../utils/environment';
import { ReactNativeLibraries } from '../utils/rnlibraries';
import { RN_GLOBAL_OBJ } from '../utils/worldwide';

const RNSentryOnDrawReporterClass = 'RNSentryOnDrawReporter';

export const nativeComponentExists = UIManager.hasViewManagerConfig
  ? UIManager.hasViewManagerConfig(RNSentryOnDrawReporterClass)
  : false;

/**
 * This is a fallback component for environments where the native component is not available.
 */
class RNSentryOnDrawReporterNoop extends React.Component<RNSentryOnDrawReporterProps> {
  public render(): React.ReactNode {
    return <View {...this.props} />;
  }
}

const getViewConfig = (): Record<string, unknown> => ({
  uiViewClassName: RNSentryOnDrawReporterClass,
  validAttributes: { initialDisplay: true, fullDisplay: true, parentSpanId: true },
});

// React Native only has a native view config for this component through its legacy interop layer.
const hasNativeViewConfig = (): boolean =>
  !RN_GLOBAL_OBJ.RN$Bridgeless || !!RN_GLOBAL_OBJ.RN$LegacyInterop_UIManager_getConstants;

let RNSentryOnDrawReporter: HostComponent<RNSentryOnDrawReporterProps> | typeof RNSentryOnDrawReporterNoop;

const resolveNativeReporter = (): HostComponent<RNSentryOnDrawReporterProps> | undefined => {
  const reactNative = ReactNativeLibraries.ReactNative;
  const reporter = hasNativeViewConfig()
    ? reactNative?.requireNativeComponent?.<RNSentryOnDrawReporterProps>(RNSentryOnDrawReporterClass)
    : reactNative?.getNativeComponent?.<RNSentryOnDrawReporterProps>(RNSentryOnDrawReporterClass, getViewConfig);
  // The vendored HostComponent type predates the one exported by current React Native versions.
  return reporter as unknown as HostComponent<RNSentryOnDrawReporterProps> | undefined;
};

/**
 * Native component that reports the on draw timestamp.
 */
export const getRNSentryOnDrawReporter = (): typeof RNSentryOnDrawReporter => {
  if (!RNSentryOnDrawReporter) {
    RNSentryOnDrawReporter =
      (!isExpoGo() && nativeComponentExists && resolveNativeReporter()) || RNSentryOnDrawReporterNoop;
  }
  return RNSentryOnDrawReporter;
};
