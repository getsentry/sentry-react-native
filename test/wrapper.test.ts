import { NATIVE } from "../src/js/wrapper";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        captureEnvelope: jest.fn((envelope) => Promise.resolve(envelope)),
        crash: jest.fn(),
        deviceContexts: jest.fn(() => Promise.resolve({})),
        fetchRelease: jest.fn(() =>
          Promise.resolve({
            build: "1.0.0.1",
            id: "test-mock",
            version: "1.0.0"
          })
        ),
        getStringBytesLength: jest.fn(() => Promise.resolve(1)),
        nativeClientAvailable: true,
        nativeTransport: true,
        sendEvent: jest.fn(() => Promise.resolve()),
        startWithOptions: jest.fn((options) => Promise.resolve(options))
      }
    },
    Platform: {
      OS: "iOS"
    }
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

beforeEach(() => {
  NATIVE.platform = "ios";
});

describe("Tests Native Wrapper", () => {
  describe("startWithOptions", () => {
    test("calls native module", async () => {
      const RN = require("react-native");

      await NATIVE.startWithOptions({ dsn: "test" });

      expect(RN.NativeModules.RNSentry.startWithOptions).toBeCalled();
    });

    test("warns if there is no dsn", async () => {
      const RN = require("react-native");
      console.warn = jest.fn();

      await NATIVE.startWithOptions({});

      expect(RN.NativeModules.RNSentry.startWithOptions).toBeCalled();
      expect(console.warn).toBeCalled();
    });
  });

  describe("sendEvent", () => {
    test("calls sendEvent on iOS", async () => {
      const RN = require("react-native");

      await NATIVE.sendEvent({});
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.sendEvent).toBeCalled();
    });
    test("calls getStringByteLength and captureEnvelope on android", async () => {
      const RN = require("react-native");

      NATIVE.platform = "android";

      const event = {
        event_id: "event0",
        message: "test"
      };

      const payload = JSON.stringify({
        ...event,
        message: {
          message: event.message
        }
      });
      const header = JSON.stringify({ event_id: event.event_id });
      const item = JSON.stringify({
        content_type: "application/json",
        length: 1,
        type: "event"
      });

      // tslint:disable-next-line: no-unsafe-any
      await expect(NATIVE.sendEvent(event)).resolves.toMatch(
        `${header}\n${item}\n${payload}`
      );
    });
  });

  describe("fetchRelease", () => {
    test("fetches the release from native", async () => {
      await expect(NATIVE.fetchRelease()).resolves.toMatchObject({
        build: "1.0.0.1",
        id: "test-mock",
        version: "1.0.0"
      });
    });
  });

  describe("deviceContexts", () => {
    test("fetches the contexts from native", async () => {
      await expect(NATIVE.deviceContexts()).resolves.toMatchObject({});
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
