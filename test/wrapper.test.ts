import { NATIVE } from "../src/js/wrapper";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        crash: jest.fn(),
        fetchRelease: jest.fn(() =>
          Promise.resolve({
            build: "1.0.0.1",
            id: "test-mock",
            version: "1.0.0"
          })
        ),
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
  describe("fetchRelease", () => {
    test("fetches the release from native", async () => {
      await expect(NATIVE.fetchRelease()).resolves.toMatchObject({
        build: "1.0.0.1",
        id: "test-mock",
        version: "1.0.0"
      });
    });
  });

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
