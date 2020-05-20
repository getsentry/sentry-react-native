import { ReactNativeBackend } from "../src/js/backend";
import { SentryError } from "@sentry/utils";

const EXAMPLE_DSN =
  "https://6890c2f6677340daa4804f8194804ea2@o19635.ingest.sentry.io/148053";

jest.mock(
  "react-native",
  () => ({
    NativeModules: {
      RNSentry: {
        crash: jest.fn(),
        setLogLevel: jest.fn(),
        nativeClientAvailable: true,
        nativeTransport: true,
        startWithDsnString: jest.fn((dsn) => {
          if (typeof dsn !== "string") {
            throw new Error();
          }
          return Promise.resolve();
        })
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
  describe("initializing the backend", () => {
    test("backend initializes", async () => {
      const backend = new ReactNativeBackend({
        dsn: EXAMPLE_DSN,
        enableNative: true
      });

      await expect(backend.eventFromMessage("test")).resolves.toBeDefined();
    });

    test("invalid dsn is thrown", () => {
      try {
        // tslint:disable-next-line: no-unused-expression
        new ReactNativeBackend({
          dsn: "not a dsn",
          enableNative: true
        });
      } catch (e) {
        // tslint:disable-next-line: no-unsafe-any
        expect(e.message).toBe("Invalid Dsn");
      }
    });

    test("undefined dsn doesn't crash", () => {
      expect(() => {
        // tslint:disable-next-line: no-unused-expression
        const backend = new ReactNativeBackend({
          dsn: undefined,
          enableNative: true
        });

        return expect(backend.eventFromMessage("test")).resolves.toBeDefined();
      }).not.toThrow();
    });
  });

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
