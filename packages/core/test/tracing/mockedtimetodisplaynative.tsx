import * as React from 'react';
import { View } from 'react-native';

import type { RNSentryOnDrawReporterProps } from '../../src/js/tracing/timetodisplaynative.types';
import { NATIVE } from '../mockWrapper';

export let nativeComponentExists = true;

export function setMockedNativeComponentExists(value: boolean): void {
  nativeComponentExists = value;
}

/**
 * {
 *  [spanId]: timestampInSeconds,
 * }
 */
export function mockRecordedTimeToDisplay({
  ttidNavigation = {},
  ttid = {},
  ttfd = {},
}: {
  'ttidNavigation'?: Record<string, number>,
  ttid?: Record<string, number>,
  ttfd?: Record<string, number>,
}): void {
  NATIVE.popTimeToDisplayFor.mockImplementation((key: string) => {
    if (key.startsWith('ttid-navigation-')) {
      return Promise.resolve(ttidNavigation[key.substring(16)]);
    } else if (key.startsWith('ttid-')) {
      return Promise.resolve(ttid[key.substring(5)]);
    } else if (key.startsWith('ttfd-')) {
      return Promise.resolve(ttfd[key.substring(5)]);
    }
    return Promise.resolve(undefined);
  });
}

let mockedProps: RNSentryOnDrawReporterProps[] = [];

export function getMockedOnDrawReportedProps(): RNSentryOnDrawReporterProps[] {
  return mockedProps;
}

export function clearMockedOnDrawReportedProps(): void {
  mockedProps = [];
}

function RNSentryOnDrawReporterMock(props: RNSentryOnDrawReporterProps): React.ReactElement {
  mockedProps.push(props);
  return <View />;
}

export const getRNSentryOnDrawReporter = (): typeof RNSentryOnDrawReporterMock => {
  return RNSentryOnDrawReporterMock;
}
