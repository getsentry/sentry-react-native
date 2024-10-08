jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.UIManager = {};
  return RN;
});

jest.mock('../../src/js/utils/rnlibraries', () => {
  const webLibrary = jest.requireActual('../../src/js/utils/rnlibraries.web');
  return {
    ...webLibrary,
  };
});

import { getRNSentryOnDrawReporter } from '../../src/js/tracing/timetodisplaynative';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';

describe('timetodisplaynative', () => {
  test('requireNativeComponent to be undefined', () => {
    expect(ReactNativeLibraries).toBeDefined();
    expect(ReactNativeLibraries.ReactNative?.requireNativeComponent).not.toBeDefined();
  });

  test('getRNSentryOnDrawReporter returns Noop', () => {
    const drawReported = getRNSentryOnDrawReporter();

    expect(drawReported.name).toBe('RNSentryOnDrawReporterNoop');
    });
});
