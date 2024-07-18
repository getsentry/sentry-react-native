import { getRNSentryOnDrawReporter } from "../../src/js/tracing/timetodisplaynative";
import { ReactNativeLibraries } from "../../src/js/utils/rnlibraries";
import type { ReactNativeLibrariesInterface } from "../../src/js/utils/rnlibrariesinterface";

describe('timetodisplaynative', () => {
  describe('on Web', () => {
    jest.mock('../../src/js/utils/rnlibraries', () => {
      const actual = jest.requireActual('../../src/js/utils/rnlibraries.web');
      return {
        ReactNativeLibraries: actual.ReactNativeLibraries as ReactNativeLibrariesInterface
      };
    });

    test('requireNativeComponent to be defined', () => {
      const test = ReactNativeLibraries.ReactNative.requireNativeComponent;
      expect(test).toBeDefined();
    });

    test('getRNSentryOnDrawReporter returns Noop', () => {
      const drawReported = getRNSentryOnDrawReporter();
      expect(drawReported.name).toBe('RNSentryOnDrawReporterNoop');
    });
  });
});
