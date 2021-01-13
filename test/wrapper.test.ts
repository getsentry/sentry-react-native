import { Severity } from "@sentry/types";
import { logger } from "@sentry/utils";

import { NATIVE } from "../src/js/wrapper";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        addBreadcrumb: jest.fn(),
        captureEnvelope: jest.fn((envelope) => Promise.resolve(envelope)),
        crash: jest.fn(),
        deviceContexts: jest.fn(() => Promise.resolve({ someContext: 0 })),
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
      OS: "ios",
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

      RN.NativeModules.RNSentry.startWithOptions = jest.fn();

      await NATIVE.startWithOptions({ dsn: "test", enableNative: true });

      expect(RN.NativeModules.RNSentry.startWithOptions).toBeCalled();
    });

    test("warns if there is no dsn", async () => {
      const RN = require("react-native");

      RN.NativeModules.RNSentry.startWithOptions = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.startWithOptions({ enableNative: true });

      expect(RN.NativeModules.RNSentry.startWithOptions).not.toBeCalled();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        "Warning: No DSN was provided. The Sentry SDK will be disabled. Native SDK will also not be initalized."
      );
    });

    test("does not call native module with enableNative: false", async () => {
      const RN = require("react-native");

      RN.NativeModules.RNSentry.startWithOptions = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.startWithOptions({
        dsn: "test",
        enableNative: false,
        enableNativeNagger: true,
      });

      expect(RN.NativeModules.RNSentry.startWithOptions).not.toBeCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.warn).toHaveBeenLastCalledWith(
        "Note: Native Sentry SDK is disabled."
      );
    });

    test("does not initialize with autoInitializeNativeSdk: false", async () => {
      const RN = require("react-native");

      RN.NativeModules.RNSentry.startWithOptions = jest.fn();
      logger.warn = jest.fn();

      await NATIVE.startWithOptions({
        dsn: "test",
        enableNative: true,
        autoInitializeNativeSdk: false,
      });

      expect(RN.NativeModules.RNSentry.startWithOptions).not.toBeCalled();

      await NATIVE.addBreadcrumb({
        message: "test",
      });

      expect(RN.NativeModules.RNSentry.addBreadcrumb).toBeCalledWith({
        message: "test",
      });
    });
  });

  describe("sendEvent", () => {
    test("calls only captureEnvelope on iOS", async () => {
      const RN = require("react-native");

      const event = {
        event_id: "event0",
        message: "test",
        sdk: {
          name: "test-sdk-name",
          version: "2.1.3",
        },
      };

      await NATIVE.sendEvent(event);

      expect(RN.NativeModules.RNSentry.captureEnvelope).toBeCalledWith({
        header: {
          event_id: event.event_id,
          sdk: event.sdk,
        },
        payload: {
          ...event,
          message: {
            message: event.message,
          },
        },
      });
    });
    test("serializes class instances on iOS", async () => {
      const RN = require("react-native");

      class TestInstance {
        value: number = 0;
        method = () => null;
      }

      const event = {
        event_id: "event0",
        message: "test",
        sdk: {
          name: "test-sdk-name",
          version: "2.1.3",
        },
        instance: new TestInstance(),
      };

      await NATIVE.sendEvent(event as any);

      expect(RN.NativeModules.RNSentry.captureEnvelope).toBeCalledWith({
        header: {
          event_id: event.event_id,
          sdk: event.sdk,
        },
        payload: {
          ...event,
          message: {
            message: event.message,
          },
          instance: {
            value: 0,
          },
        },
      });
    });
    test("serializes class instances on Android", async () => {
      const RN = require("react-native");
      NATIVE.platform = "android";

      class TestInstance {
        value: number = 0;
        method = () => null;
      }

      const event = {
        event_id: "event0",
        message: "test",
        sdk: {
          name: "test-sdk-name",
          version: "2.1.3",
        },
        instance: new TestInstance(),
      };

      await NATIVE.sendEvent(event as any);

      const headerString = JSON.stringify({
        event_id: event.event_id,
        sdk: event.sdk,
      });
      const itemString = JSON.stringify({
        content_type: "application/json",
        length: 1,
        type: "event",
      });
      const payloadString = JSON.stringify({
        ...event,
        message: {
          message: event.message,
        },
        instance: {
          value: 0,
        },
      });

      expect(RN.NativeModules.RNSentry.captureEnvelope).toBeCalledWith(
        `${headerString}\n${itemString}\n${payloadString}`
      );
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
        expect(e.message).toMatch("Native is disabled");
      }
      expect(RN.NativeModules.RNSentry.sendEvent).not.toBeCalled();
      expect(RN.NativeModules.RNSentry.getStringBytesLength).not.toBeCalled();
      expect(RN.NativeModules.RNSentry.captureEnvelope).not.toBeCalled();
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
    test("returns context object from native module on ios", async () => {
      const RN = require("react-native");

      NATIVE.platform = "ios";

      await expect(NATIVE.deviceContexts()).resolves.toMatchObject({
        someContext: 0,
      });

      expect(RN.NativeModules.RNSentry.deviceContexts).toBeCalled();
    });
    test("returns empty object on android", async () => {
      const RN = require("react-native");

      NATIVE.platform = "android";

      await expect(NATIVE.deviceContexts()).resolves.toMatchObject({});

      expect(RN.NativeModules.RNSentry.deviceContexts).not.toBeCalled();
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

      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
    test("does not call crash if enableNative is false", async () => {
      const RN = require("react-native");

      await NATIVE.startWithOptions({ dsn: "test-dsn", enableNative: false });
      NATIVE.crash();

      expect(RN.NativeModules.RNSentry.crash).not.toBeCalled();
    });
  });

  describe("setUser", () => {
    test("serializes all user object keys", async () => {
      const RN = require("react-native");

      NATIVE.setUser({
        email: "hello@sentry.io",
        // @ts-ignore Intentional incorrect type to simulate using a double as an id (We had a user open an issue because this didn't work before)
        id: 3.14159265359,
        unique: 123,
      });

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

      expect(RN.NativeModules.RNSentry.setUser).toBeCalledWith(
        {
          id: "Hello",
        },
        {}
      );
    });
  });

  describe("_processLevel", () => {
    test("converts deprecated levels", () => {
      expect(NATIVE._processLevel(Severity.Log)).toBe(Severity.Debug);
      expect(NATIVE._processLevel(Severity.Critical)).toBe(Severity.Fatal);
    });
    test("returns non-deprecated levels", () => {
      expect(NATIVE._processLevel(Severity.Debug)).toBe(Severity.Debug);
      expect(NATIVE._processLevel(Severity.Fatal)).toBe(Severity.Fatal);
      expect(NATIVE._processLevel(Severity.Info)).toBe(Severity.Info);
      expect(NATIVE._processLevel(Severity.Warning)).toBe(Severity.Warning);
      expect(NATIVE._processLevel(Severity.Error)).toBe(Severity.Error);
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
