jest.mock('../../src/js/integrations/reactnativeerrorhandlersutils');
jest.mock('../../src/js/utils/environment');

import type { SeverityLevel } from '@sentry/core';
import { addGlobalUnhandledRejectionInstrumentationHandler, captureException, setCurrentClient } from '@sentry/core';

import { reactNativeErrorHandlersIntegration } from '../../src/js/integrations/reactnativeerrorhandlers';
import {
  checkPromiseAndWarn,
  polyfillPromise,
  requireRejectionTracking,
} from '../../src/js/integrations/reactnativeerrorhandlersutils';
import { isHermesEnabled, isWeb } from '../../src/js/utils/environment';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

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
      integration.setupOnce();

      expect(RN_GLOBAL_OBJ.ErrorUtils.setGlobalHandler).toHaveBeenCalled();
    });

    test('Sets handled:false on a fatal error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback(new Error('Test Error'), true);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('fatal' as SeverityLevel);
      expect(event?.exception?.values?.[0].mechanism?.handled).toBe(false);
      expect(event?.exception?.values?.[0].mechanism?.type).toBe('onerror');
    });

    test('Does not set handled:false on a non-fatal error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback(new Error('Test Error'), false);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('error' as SeverityLevel);
      expect(event?.exception?.values?.[0].mechanism?.handled).toBe(true);
      expect(event?.exception?.values?.[0].mechanism?.type).toBe('generic');
    });

    test('Includes original exception in hint', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

      expect(errorHandlerCallback).not.toBeNull();

      await errorHandlerCallback(new Error('Test Error'), false);
      await client.flush();

      const hint = client.hint;

      expect(hint).toEqual(expect.objectContaining({ originalException: new Error('Test Error') }));
    });
  });

  describe('onUnhandledRejection', () => {
    test('unhandled rejected promise is captured with JSC approach', async () => {
      (isWeb as jest.Mock).mockReturnValue(false);
      (isHermesEnabled as jest.Mock).mockReturnValue(false);

      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

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

      onUnhandledHandler('test-id', 'Test Error');

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
      integration.setupOnce();

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
        integration.setupOnce();

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
        integration.setupOnce();

        const [options] = mockEnablePromiseRejectionTracker.mock.calls[0];
        const onUnhandledHandler = options.onUnhandled;

        const testError = new Error('Hermes Test Error');
        onUnhandledHandler('hermes-test-error', testError);

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
        integration.setupOnce();

        expect(addGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledTimes(1);
        expect(addGlobalUnhandledRejectionInstrumentationHandler).toHaveBeenCalledWith(expect.any(Function));

        // Verify JSC fallback was not used
        expect(polyfillPromise).not.toHaveBeenCalled();
        expect(requireRejectionTracking).not.toHaveBeenCalled();
      });

      test('captures unhandled rejection with the callback', () => {
        const integration = reactNativeErrorHandlersIntegration();
        integration.setupOnce();

        const [callback] = (addGlobalUnhandledRejectionInstrumentationHandler as jest.Mock).mock.calls[0];

        const mockError = new Error('Web Test Error');
        callback(mockError);

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
        integration.setupOnce();

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
        integration.setupOnce();

        expect(polyfillPromise).toHaveBeenCalledTimes(1);
        expect(requireRejectionTracking).toHaveBeenCalledTimes(1);
      });

      test('respects patchGlobalPromise option', () => {
        const integration = reactNativeErrorHandlersIntegration({ patchGlobalPromise: false });
        integration.setupOnce();

        expect(polyfillPromise).not.toHaveBeenCalled();
        expect(requireRejectionTracking).not.toHaveBeenCalled();
      });
    });
  });
});
