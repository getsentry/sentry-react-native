import { ReactNativeBackend } from "../src/js/backend";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        crash: jest.fn()
      }
    },
    Platform: {
      OS: "mock"
    },
    YellowBox: {
      ignoreWarnings: jest.fn()
    }
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

describe("Tests ReactNativeBackend", () => {
  describe("nativeCrash", () => {
    test("calls NativeModules crash", () => {
      const RN = require("react-native");

      const backend = new ReactNativeBackend({
        enableNative: true
      });
      backend.nativeCrash();

      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
  });
});
