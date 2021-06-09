import { NoopTransport } from "@sentry/core";
import * as RN from "react-native";

import { ReactNativeBackend } from "../src/js/backend";
import { NATIVE } from "../src/js/wrapper";

const EXAMPLE_DSN =
  "https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        crash: jest.fn(),
        nativeClientAvailable: true,
        nativeTransport: true,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        startWithOptions: async (options: any): Promise<boolean> => {
          if (typeof options.dsn !== "string") {
            throw new Error();
          }
          return true;
        },
      },
    },
    Platform: {
      OS: "mock",
    },
    LogBox: {
      ignoreLogs: jest.fn(),
    },
    YellowBox: {
      ignoreWarnings: jest.fn(),
    },
  }),
  /* virtual allows us to mock modules that aren't in package.json */
  { virtual: true }
);

afterEach(() => {
  jest.resetAllMocks();
  NATIVE.enableNative = true;
});

describe("Tests ReactNativeBackend", () => {
  describe("initializing the backend", () => {
    test("backend initializes", async () => {
      const backend = new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: true,
      });

      await expect(backend.eventFromMessage("test")).resolves.toBeDefined();
      // @ts-ignore: Is Mocked
      // eslint-disable-next-line @typescript-eslint/unbound-method
      await expect(RN.LogBox.ignoreLogs).toBeCalled();
    });

    test("invalid dsn is thrown", () => {
      try {
        new ReactNativeBackend({
          dsn: "not a dsn",
          enableNative: true,
        });
      } catch (e) {
        expect(e.message).toBe("Invalid Dsn");
      }
    });

    test("undefined dsn doesn't crash", () => {
      expect(() => {
        const backend = new ReactNativeBackend({
          dsn: undefined,
          enableNative: true,
        });

        return expect(backend.eventFromMessage("test")).resolves.toBeDefined();
      }).not.toThrow();
    });

    test("falls back to YellowBox if no LogBox", async () => {
      // @ts-ignore: Is Mocked
      RN.LogBox = undefined;

      const backend = new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: true,
      });

      await expect(backend.eventFromMessage("test")).resolves.toBeDefined();
      // eslint-disable-next-line deprecation/deprecation
      await expect(RN.YellowBox.ignoreWarnings).toBeCalled();
    });
  });

  describe("onReady", () => {
    test("calls onReady callback with true if Native SDK is initialized", (done) => {
      new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: true,
        transport: NoopTransport,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(true);

          done();
        },
      });
    });

    test("calls onReady callback with false if Native SDK was not initialized", (done) => {
      new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: false,
        transport: NoopTransport,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(false);

          done();
        },
      });
    });

    test("calls onReady callback with false if Native SDK failed to initialize", (done) => {
      const RN = require("react-native");

      RN.NativeModules.RNSentry.startWithOptions = async () => {
        throw new Error();
      };

      new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: true,
        transport: NoopTransport,
        onReady: ({ didCallNativeInit }) => {
          expect(didCallNativeInit).toBe(false);

          done();
        },
      });
    });
  });

  describe("nativeCrash", () => {
    test("calls NativeModules crash", () => {
      const RN = require("react-native");

      const backend = new ReactNativeBackend({
        enableNative: true,
      });
      backend.nativeCrash();

      expect(RN.NativeModules.RNSentry.crash).toBeCalled();
    });
  });
});
