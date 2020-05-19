import { NATIVE } from "../src/js/wrapper";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        crash: jest.fn(),
        nativeClientAvailable: true,
        nativeTransport: true
      }
    },
    Platform: {
      OS: "mock"
    }
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

describe("Tests Native Wrapper", () => {
  describe("isModuleLoaded", () => {
    test("returns true when module is loaded", () => {
      expect(NATIVE.isModuleLoaded()).toBe(true);
    });
  });

  describe("crash", () => {
    test("calls the native crash", () => {
      const RN = require("react-native");

      NATIVE.crash();

      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
  });

  describe("isNativeClientAvailable", () => {
    test("checks if native client is available", () => {
      expect(NATIVE.isNativeClientAvailable()).toBe(true);
    });
  });

  describe("isNativeTransportAvailable", () => {
    test("checks if native transport is available", () => {
      expect(NATIVE.isNativeTransportAvailable()).toBe(true);
    });
  });
});
