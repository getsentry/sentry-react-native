jest.mock('../../src/js/integrations/reactnativeerrorhandlersutils');
jest.mock('../../src/js/utils/environment');

import type { SeverityLevel } from '@sentry/core';

import { addGlobalUnhandledRejectionInstrumentationHandler, captureException, setCurrentClient } from '@sentry/core';

import * as globalErrorBus from '../../src/js/integrations/globalErrorBus';
import { reactNativeErrorHandlersIntegration } from '../../src/js/integrations/reactnativeerrorhandlers';
import {
  checkPromiseAndWarn,
  polyfillPromise,
  requireRejectionTracking,
} from '../../src/js/integrations/reactnativeerrorhandlersutils';
import { isHermesEnabled, isWeb } from '../../src/js/utils/environment';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/integrations/reactnativeerrorhandlersutils');

let errorHandlerCallback: ((error: Error, isFatal?: boolean) => Promise<void>) | null = null;

jest.mock('../../src/js/utils/worldwide', () => {
  const actual = jest.requireActual('../../src/js/utils/worldwide');
  return {
    ...actual,
    RN_GLOBAL_OBJ: {
      ...actual.RN_GLOBAL_OBJ,
      ErrorUtils: {
        setGlobalHandler: jest.fn(callback => {
          errorHandlerCallback = callback;
        }),
        getGlobalHandler: jest.fn(() => jest.fn()),
        reportError: jest.fn(),
      },
    },
  };
});

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    captureException: jest.fn(),
    addGlobalUnhandledRejectionInstrumentationHandler: jest.fn(),
  };
});

describe('ReactNativeErrorHandlers', () => {
  let client: TestClient;
  let mockDisable: jest.Mock;
  let mockEnable: jest.Mock;
  let originalHermesInternal: any;
  let mockEnablePromiseRejectionTracker: jest.Mock;

  beforeEach(() => {
    mockDisable = jest.fn();
    mockEnable = jest.fn();
    (requireRejectionTracking as jest.Mock).mockReturnValue({
      disable: mockDisable,
      enable: mockEnable,
    });
    (polyfillPromise as jest.Mock).mockImplementation(() => {});
    (checkPromiseAndWarn as jest.Mock).mockImplementation(() => {});

    errorHandlerCallback = null;

    (isWeb as jest.Mock).mockReturnValue(false);
    (isHermesEnabled as jest.Mock).mockReturnValue(false);

    originalHermesInternal = RN_GLOBAL_OBJ.HermesInternal;

    client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();

    mockEnablePromiseRejectionTracker = jest.fn();
    RN_GLOBAL_OBJ.HermesInternal = {
      enablePromiseRejectionTracker: mockEnablePromiseRejectionTracker,
      hasPromise: jest.fn(() => true),
    };

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
    RN_GLOBAL_OBJ.HermesInternal = originalHermesInternal;
  });

  describe('onError', () => {
    test('Sets up the global error handler', () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      expect(RN_GLOBAL_OBJ.ErrorUtils!.setGlobalHandler).toHaveBeenCalled();
    });

    test('Sets handled:false on a fatal error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback!(new Error('Test Error'), true);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('fatal' as SeverityLevel);
      expect(event?.exception?.values?.[0]?.mechanism?.handled).toBe(false);
      expect(event?.exception?.values?.[0]?.mechanism?.type).toBe('onerror');
    });

    test('Does not set handled:false on a non-fatal error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback!(new Error('Test Error'), false);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('error' as SeverityLevel);
      expect(event?.exception?.values?.[0]?.mechanism?.handled).toBe(true);
      expect(event?.exception?.values?.[0]?.mechanism?.type).toBe('generic');
    });

    test('Includes original exception in hint', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback!(new Error('Test Error'), false);
      await client.flush();

      const hint = client.hint;

      expect(hint).toEqual(expect.objectContaining({ originalException: new Error('Test Error') }));
    });

    test('Uses componentStack as fallback when error has no stack', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      const error: any = {
        message: 'Value is undefined, expected an Object',
        componentStack:
          '\n    at UserMessage (http://localhost:8081/index.bundle:1:5274251)' +
          '\n    at renderItem (http://localhost:8081/index.bundle:1:5280705)',
      };

      await errorHandlerCallback!(error, true);
      await client.flush();

      expect(error.stack).toBe(
        'Value is undefined, expected an Object' +
          '\n    at UserMessage (http://localhost:8081/index.bundle:1:5274251)' +
          '\n    at renderItem (http://localhost:8081/index.bundle:1:5280705)',
      );
    });

    test('Uses componentStack as fallback when stack has no frames', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      const error: any = {
        message: 'Value is undefined, expected an Object',
        stack: 'Error: Value is undefined, expected an Object',
        componentStack:
          '\n    at UserMessage (http://localhost:8081/index.bundle:1:5274251)' +
          '\n    at renderItem (http://localhost:8081/index.bundle:1:5280705)',
      };

      await errorHandlerCallback!(error, true);
      await client.flush();

      expect(error.stack).toBe(
        'Value is undefined, expected an Object' +
          '\n    at UserMessage (http://localhost:8081/index.bundle:1:5274251)' +
          '\n    at renderItem (http://localhost:8081/index.bundle:1:5280705)',
      );
    });

    test('Does not override stack when error already has frames', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      const error = new Error('Test Error');
      (error as any).componentStack = '\n    at SomeComponent (http://localhost:8081/index.bundle:1:100)';
      const originalStack = error.stack;

      await errorHandlerCallback!(error, false);

      expect(error.stack).toBe(originalStack);
    });

    describe('GlobalErrorBoundary integration', () => {
      let publishSpy: jest.SpyInstance;
      let hasSubscribersSpy: jest.SpyInstance;
      let defaultHandler: jest.Mock;

      beforeEach(() => {
        publishSpy = jest.spyOn(globalErrorBus, 'publishGlobalError').mockImplementation(() => {});
        hasSubscribersSpy = jest.spyOn(globalErrorBus, 'hasInterestedSubscribers');
        defaultHandler = jest.fn();
        (RN_GLOBAL_OBJ.ErrorUtils!.getGlobalHandler as jest.Mock).mockReturnValue(defaultHandler);
        set__DEV__(false);
      });

      afterEach(() => {
        publishSpy.mockRestore();
        hasSubscribersSpy.mockRestore();
        set__DEV__(true);
      });

      test('publishes fatals to the global error bus', async () => {
        hasSubscribersSpy.mockReturnValue(false);
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        const error = new Error('Boom');
        await errorHandlerCallback!(error, true);
        await client.flush();

        expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({ error, isFatal: true, kind: 'onerror' }));
      });

      test('still invokes the default handler when no boundary is subscribed', async () => {
        hasSubscribersSpy.mockReturnValue(false);
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        await errorHandlerCallback!(new Error('Boom'), true);
        await client.flush();

        expect(defaultHandler).toHaveBeenCalledTimes(1);
      });

      test('skips the default handler on fatals when a boundary is subscribed', async () => {
        hasSubscribersSpy.mockImplementation((kind, isFatal) => kind === 'onerror' && isFatal === true);
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        await errorHandlerCallback!(new Error('Boom'), true);
        await client.flush();

        expect(defaultHandler).not.toHaveBeenCalled();
      });

      test('releases handlingFatal latch after flush so subsequent fatals are captured', async () => {
        // With a GlobalErrorBoundary mounted, defaultHandler is skipped and the
        // app survives the first fatal. The latch that previously relied on the
        // app crashing must now release so later fatals still flow through.
        hasSubscribersSpy.mockReturnValue(true);
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        await errorHandlerCallback!(new Error('First fatal'), true);
        await client.flush();
        await new Promise(resolve => setImmediate(resolve));

        (captureException as jest.Mock).mockClear();
        const secondError = new Error('Second fatal');
        await errorHandlerCallback!(secondError, true);
        await client.flush();

        expect(client.event).toBeDefined();
        expect(client.event?.exception?.values?.[0]?.value).toBe('Second fatal');
        expect(publishSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({ error: secondError, isFatal: true, kind: 'onerror' }),
        );
      });

      test('re-evaluates subscribers after flush (boundary unmounts during flush)', async () => {
        // Always returns false — simulates the boundary being gone by the
        // time the flush resolves. The check must happen inside the .then,
        // not before client.flush(), otherwise we'd never call defaultHandler.
        hasSubscribersSpy.mockReturnValue(false);
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        await errorHandlerCallback!(new Error('Boom'), true);
        await client.flush();
        // Drain the .then() microtask attached to the integration's flush promise.
        await new Promise(resolve => setImmediate(resolve));

        expect(defaultHandler).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('onUnhandledRejection', () => {
    test('unhandled rejected promise is captured with JSC approach', async () => {
      (isWeb as jest.Mock).mockReturnValue(false);
      (isHermesEnabled as jest.Mock).mockReturnValue(false);

      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      expect(polyfillPromise).toHaveBeenCalled();
      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
          onHandled: expect.any(Function),
        }),
      );

      const [options] = mockEnable.mock.calls[0];
      const onUnhandledHandler = options.onUnhandled;

      const publishSpy = jest.spyOn(globalErrorBus, 'publishGlobalError').mockImplementation(() => {});
      onUnhandledHandler('test-id', 'Test Error');
      expect(publishSpy).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Test Error', isFatal: false, kind: 'onunhandledrejection' }),
      );
      publishSpy.mockRestore();

      expect(captureException).toHaveBeenCalledWith(
        'Test Error',
        expect.objectContaining({
          data: { id: 'test-id' },
          originalException: 'Test Error',
          mechanism: {
            handled: true,
            type: 'onunhandledrejection',
          },
        }),
      );
    });

    test('error like unhandled rejected promise is captured without synthetical error', async () => {
      (isWeb as jest.Mock).mockReturnValue(false);
      (isHermesEnabled as jest.Mock).mockReturnValue(false);

      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce!();

      const [options] = mockEnable.mock.calls[0];
      const onUnhandledHandler = options.onUnhandled;

      const error = new Error('Test Error');
      onUnhandledHandler('test-id', error);

      expect(captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          data: { id: 'test-id' },
          originalException: error,
          syntheticException: undefined,
          mechanism: {
            handled: true,
            type: 'onunhandledrejection',
          },
        }),
      );
    });

    describe('Hermes engine', () => {
      beforeEach(() => {
        (isHermesEnabled as jest.Mock).mockReturnValue(true);
      });

      test('uses native Hermes promise rejection tracking', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        expect(mockEnablePromiseRejectionTracker).toHaveBeenCalledTimes(1);
        expect(mockEnablePromiseRejectionTracker).toHaveBeenCalledWith(
          expect.objectContaining({
            allRejections: true,
            onUnhandled: expect.any(Function),
            onHandled: expect.any(Function),
          }),
        );

        expect(polyfillPromise).not.toHaveBeenCalled();
      });

      test('captures unhandled rejection with Hermes tracker', async () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        const [options] = mockEnablePromiseRejectionTracker.mock.calls[0];
        const onUnhandledHandler = options.onUnhandled;

        const testError = new Error('Hermes Test Error');
        const publishSpy = jest.spyOn(globalErrorBus, 'publishGlobalError').mockImplementation(() => {});
        onUnhandledHandler('hermes-test-error', testError);
        expect(publishSpy).toHaveBeenCalledWith(
          expect.objectContaining({ error: testError, isFatal: false, kind: 'onunhandledrejection' }),
        );
        publishSpy.mockRestore();

        expect(captureException).toHaveBeenCalledWith(
          testError,
          expect.objectContaining({
            data: { id: 'hermes-test-error' },
            originalException: testError,
            mechanism: {
              handled: true,
              type: 'onunhandledrejection',
            },
          }),
        );
      });
    });

    describe('React Native Web', () => {
      beforeEach(() => {
        (isWeb as jest.Mock).mockReturnValue(true);
        (isHermesEnabled as jest.Mock).mockReturnValue(false);
      });

      test('uses addGlobalUnhandledRejectionInstrumentationHandler for React Native Web', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        expect(addGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledTimes(1);
        expect(addGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));

        // Verify JSC fallback was not used
        expect(polyfillPromise).not.toHaveBeenCalled();
        expect(requireRejectionTracking).not.toHaveBeenCalled();
      });

      test('captures unhandled rejection with the callback', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        const [callback] = (addGlobalUnhandledRejectionInstrumentationHandler as jest.Mock).mock.calls[0];

        const mockError = new Error('Web Test Error');
        const publishSpy = jest.spyOn(globalErrorBus, 'publishGlobalError').mockImplementation(() => {});
        callback(mockError);
        expect(publishSpy).toHaveBeenCalledWith(
          expect.objectContaining({ error: mockError, isFatal: false, kind: 'onunhandledrejection' }),
        );
        publishSpy.mockRestore();

        expect(captureException).toHaveBeenCalledWith(
          mockError,
          expect.objectContaining({
            originalException: mockError,
            mechanism: {
              handled: false,
              type: 'onunhandledrejection',
            },
          }),
        );
      });

      test('handles non-error rejection with synthetic error', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        const [callback] = (addGlobalUnhandledRejectionInstrumentationHandler as jest.Mock).mock.calls[0];

        const nonErrorObject = { message: 'Custom rejection object' };
        callback(nonErrorObject);

        expect(captureException).toHaveBeenCalledWith(
          nonErrorObject,
          expect.objectContaining({
            originalException: nonErrorObject,
            syntheticException: expect.anything(),
            mechanism: {
              handled: false,
              type: 'onunhandledrejection',
            },
          }),
        );
      });
    });

    describe('JSC and other environments', () => {
      beforeEach(() => {
        (isHermesEnabled as jest.Mock).mockReturnValue(false);
        (isWeb as jest.Mock).mockReturnValue(false);
      });

      test('uses existing polyfill for JSC environments', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce!();

        expect(polyfillPromise).toHaveBeenCalledTimes(1);
        expect(requireRejectionTracking).toHaveBeenCalledTimes(1);
      });

      test('respects patchGlobalPromise option', () => {
        const integration = reactNativeErrorHandlersIntegration({ patchGlobalPromise: false });
        integration.setupOnce!();

        expect(polyfillPromise).not.toHaveBeenCalled();
        expect(requireRejectionTracking).not.toHaveBeenCalled();
      });
    });
  });
});

function set__DEV__(value: boolean): void {
  Object.defineProperty(globalThis, '__DEV__', { value, writable: true, configurable: true });
}
