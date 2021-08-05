import { ReactNativeErrorHandlers } from "../../src/js/integrations/reactnativeerrorhandlers";

jest.mock("@sentry/core", () => {
  const core = jest.requireActual("@sentry/core");

  const client = {
    getOptions: () => ({}),
    flush: jest.fn(() => Promise.resolve()),
  };

  const hub = {
    getClient: jest.fn(() => client),
    captureEvent: jest.fn(),
  };

  return {
    ...core,
    addGlobalEventProcessor: jest.fn(),
    getCurrentHub: () => hub,
  };
});

import { getCurrentHub, Hub } from "@sentry/core";
import { Client, Severity } from "@sentry/types";
import { getGlobalObject } from "@sentry/utils";

const originalErrorHandler = jest.fn();

beforeEach(() => {
  const global = getGlobalObject<{ __DEV__: boolean }>();
  global.__DEV__ = true;

  ErrorUtils.getGlobalHandler = () => originalErrorHandler;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("ReactNativeErrorHandlers", () => {
  describe("onError", () => {
    test("Sets handled:false on a fatal error", async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
        Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
        callback = _callback as typeof callback;
      });

      const integration = new ReactNativeErrorHandlers();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

      await callback(new Error("Test Error"), true);

      const hub = getCurrentHub();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockCall = (hub.captureEvent as jest.MockedFunction<
        typeof hub.captureEvent
      >).mock.calls[0];
      const event = mockCall[0];

      expect(event.level).toBe(Severity.Fatal);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(false);
      expect(event.exception?.values?.[0].mechanism?.type).toBe("onerror");
    });

    test("Does not set handled:false on a non-fatal error", async () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
        Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
        callback = _callback as typeof callback;
      });

      const integration = new ReactNativeErrorHandlers();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

      await callback(new Error("Test Error"), false);

      const hub = getCurrentHub();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockCall = (hub.captureEvent as jest.MockedFunction<
        typeof hub.captureEvent
      >).mock.calls[0];
      const event = mockCall[0];

      expect(event.level).toBe(Severity.Error);
      expect(event.exception?.values?.[0].mechanism?.handled).toBe(true);
      expect(event.exception?.values?.[0].mechanism?.type).toBe("generic");
    });
  });

  test("Calls the default error handler in dev mode", async () => {
    let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
      Promise.resolve();

    ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
      callback = _callback as typeof callback;
    });

    const integration = new ReactNativeErrorHandlers();

    integration.setupOnce();

    expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

    await callback(new Error("Test Error"), false);

    const client = getCurrentHub().getClient();
    expect(client).toBeDefined();

    if (client) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.flush).not.toBeCalled();
      expect(originalErrorHandler).toBeCalled();
    }
  });

  test("Calls the default error handler along with client flush.", async () => {
    const global = getGlobalObject<{ __DEV__: boolean }>();
    global.__DEV__ = false;

    let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
      Promise.resolve();

    ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
      callback = _callback as typeof callback;
    });

    const integration = new ReactNativeErrorHandlers();

    integration.setupOnce();

    expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

    await callback(new Error("Test Error"), false);

    const client = getCurrentHub().getClient();
    expect(client).toBeDefined();

    if (client) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(client.flush).toBeCalled();
      expect(originalErrorHandler).toBeCalled();
    }
  });

  test("Calls the default error handler if client is not present", async () => {
    let callback: (error: Error, isFatal: boolean) => Promise<void> = () =>
      Promise.resolve();

    (getCurrentHub().getClient as jest.MockedFunction<
      () => Client | undefined
    >).mockReturnValue(undefined);

    ErrorUtils.setGlobalHandler = jest.fn((_callback) => {
      callback = _callback as typeof callback;
    });

    const integration = new ReactNativeErrorHandlers();

    integration.setupOnce();

    expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(callback);

    await callback(new Error("Test Error"), false);

    const client = getCurrentHub().getClient();
    expect(client).not.toBeDefined();

    expect(originalErrorHandler).toBeCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(getCurrentHub().captureEvent).not.toBeCalled();
  });
});
