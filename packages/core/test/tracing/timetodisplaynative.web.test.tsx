jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  // Fixes TypeError: Cannot set property UIManager of #<Object> which has only a getter
  delete RN.UIManager;
  RN.UIManager = {};

  return RN;
});

import { getRNSentryOnDrawReporter } from '../../src/js/tracing/timetodisplaynative';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';

jest.mock('../../src/js/utils/rnlibraries', () => {
  const webLibrary = jest.requireActual('../../src/js/utils/rnlibraries.web');
  return {
    ...webLibrary,
  };
});

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
