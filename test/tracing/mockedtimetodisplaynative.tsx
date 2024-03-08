import React from 'react';
import { View } from 'react-native';

import type { RNSentryOnDrawNextFrameEvent, RNSentryOnDrawReporterProps } from '../../src/js/tracing/timetodisplaynative.types';

export let nativeComponentExists = true;

export function setMockedNativeComponentExists(value: boolean): void {
  nativeComponentExists = value;
}

export let mockedOnDrawNextFrame: (event: { nativeEvent: RNSentryOnDrawNextFrameEvent }) => void;

export function emitNativeInitialDisplayEvent(): void {
  mockedOnDrawNextFrame({ nativeEvent: { type: 'initialDisplay', newFrameTimestampInSeconds: Date.now() / 1_000 } });
}

function RNSentryOnDrawReporterMock(props: RNSentryOnDrawReporterProps): React.ReactElement {
  mockedOnDrawNextFrame = props.onDrawNextFrame;
  return <View />;
}

export const getRNSentryOnDrawReporter = (): typeof RNSentryOnDrawReporterMock => {
  return RNSentryOnDrawReporterMock;
}
