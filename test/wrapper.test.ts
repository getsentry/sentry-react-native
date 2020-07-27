import { logger } from "@sentry/utils";

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
            version: "1.0.0",
          })
        ),
        getStringBytesLength: jest.fn(() => Promise.resolve(1)),
        nativeClientAvailable: true,
        nativeTransport: true,
        sendEvent: jest.fn(() => Promise.resolve()),
        setUser: jest.fn(() => {
          return;
        }),
        startWithOptions: jest.fn((options) => Promise.resolve(options)),
      },
    },
    Platform: {
      OS: "iOS",
    },
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

beforeEach(() => {
  NATIVE.platform = "ios";
  NATIVE.enableNative = true;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("Tests Native Wrapper", () => {
  describe("startWithOptions", () => {
    test("calls native module", async () => {
      const RN = require("react-native");
      // tslint:disable-next-line: no-unsafe-any
      RN.NativeModules.RNSentry.startWithOptions = jest.fn();

      await NATIVE.startWithOptions({ dsn: "test", enableNative: true });

      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.startWithOptions).toBeCalled();
    });

    test("warns if there is no dsn", async () => {
      const RN = require("react-native");
      // tslint:disable-next-line: no-unsafe-any
      RN.NativeModules.RNSentry.startWithOptions = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.startWithOptions({ enableNative: true });
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.startWithOptions).not.toBeCalled();
      // tslint:disable-next-line: no-unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        "Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized."
      );
    });

    test("does not call native module with enableNative: false", async () => {
      const RN = require("react-native");
      // tslint:disable-next-line: no-unsafe-any
      RN.NativeModules.RNSentry.startWithOptions = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.startWithOptions({ dsn: "test", enableNative: false });
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.startWithOptions).not.toBeCalled();
      // tslint:disable-next-line: no-unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        "Note: Native Sentry SDK is disabled."
      );
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
      NATIVE.platform = "android";

      const event = {
        event_id: "event0",
        message: "test",
        sdk: {
          name: "test-sdk-name",
          version: "2.1.3",
        },
      };

      const payload = JSON.stringify({
        ...event,
        message: {
          message: event.message,
        },
      });
      const header = JSON.stringify({
        event_id: event.event_id,
        sdk: event.sdk,
      });
      const item = JSON.stringify({
        content_type: "application/json",
        length: 1,
        type: "event",
      });

      // tslint:disable-next-line: no-unsafe-any
      await expect(NATIVE.sendEvent(event)).resolves.toMatch(
        `${header}\n${item}\n${payload}`
      );
    });
    test("does not call RNSentry at all if enableNative is false", async () => {
      const RN = require("react-native");

      try {
        await NATIVE.startWithOptions({ dsn: "test-dsn", enableNative: false });
        await NATIVE.sendEvent({});
      } catch (e) {
        // tslint:disable-next-line: no-unsafe-any
        expect(e.message).toMatch("Native is disabled");
      }
      /* tslint:disable: no-unsafe-any */
      expect(RN.NativeModules.RNSentry.sendEvent).not.toBeCalled();
      expect(RN.NativeModules.RNSentry.getStringBytesLength).not.toBeCalled();
      expect(RN.NativeModules.RNSentry.captureEnvelope).not.toBeCalled();
      /* tslint:enable: no-unsafe-any */
    });
  });

  describe("fetchRelease", () => {
    test("fetches the release from native", async () => {
      await expect(NATIVE.fetchRelease()).resolves.toMatchObject({
        build: "1.0.0.1",
        id: "test-mock",
        version: "1.0.0",
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
    test("does not call crash if enableNative is false", async () => {
      const RN = require("react-native");

      await NATIVE.startWithOptions({ dsn: "test-dsn", enableNative: false });
      NATIVE.crash();
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.crash).not.toBeCalled();
    });
  });

  describe("setUser", () => {
    test("serializes all user object keys", async () => {
      const RN = require("react-native");

      NATIVE.setUser({
        email: "hello@sentry.io",
        // @ts-ignore
        id: 3.14159265359,
        unique: 123,
      });
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.setUser).toBeCalledWith(
        {
          email: "hello@sentry.io",
          id: "3.14159265359",
        },
        {
          unique: "123",
        }
      );
    });

    test("Calls native setUser with empty object as second param if no unique keys", async () => {
      const RN = require("react-native");

      NATIVE.setUser({
        id: "Hello",
      });
      // tslint:disable-next-line: no-unsafe-any
      expect(RN.NativeModules.RNSentry.setUser).toBeCalledWith(
        {
          id: "Hello",
        },
        {}
      );
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
