jest.mock('../../src/js/integrations/reactnativeerrorhandlersutils');

import { setCurrentClient } from '@sentry/core';
import type { ExtendedError, SeverityLevel } from '@sentry/types';

import { reactNativeErrorHandlersIntegration } from '../../src/js/integrations/reactnativeerrorhandlers';
import { requireRejectionTracking } from '../../src/js/integrations/reactnativeerrorhandlersutils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('ReactNativeErrorHandlers', () => {
  let client: TestClient;
  let mockDisable: jest.Mock;
  let mockEnable: jest.Mock;

  beforeEach(() => {
    mockDisable = jest.fn();
    mockEnable = jest.fn();
    (requireRejectionTracking as jest.Mock).mockReturnValue({
      disable: mockDisable,
      enable: mockEnable,
    });
    ErrorUtils.getGlobalHandler = () => jest.fn();

    client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onError', () => {
    let errorHandlerCallback: (error: Error, isFatal: boolean) => Promise<void>;

    beforeEach(() => {
      errorHandlerCallback = () => Promise.resolve();

      ErrorUtils.setGlobalHandler = jest.fn(_callback => {
        errorHandlerCallback = _callback as typeof errorHandlerCallback;
      });

      const integration = reactNativeErrorHandlersIntegration();

      integration.setupOnce();

      expect(ErrorUtils.setGlobalHandler).toHaveBeenCalledWith(errorHandlerCallback);
    });

    test('Sets handled:false on a fatal error', async () => {
      await errorHandlerCallback(new Error('Test Error'), true);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('fatal' as SeverityLevel);
      expect(event?.exception?.values?.[0].mechanism?.handled).toBe(false);
      expect(event?.exception?.values?.[0].mechanism?.type).toBe('onerror');
    });

    test('Does not set handled:false on a non-fatal error', async () => {
      await errorHandlerCallback(new Error('Test Error'), false);
      await client.flush();

      const event = client.event;

      expect(event?.level).toBe('error' as SeverityLevel);
      expect(event?.exception?.values?.[0].mechanism?.handled).toBe(true);
      expect(event?.exception?.values?.[0].mechanism?.type).toBe('generic');
    });

    test('Includes original exception in hint', async () => {
      await errorHandlerCallback(new Error('Test Error'), false);
      await client.flush();

      const hint = client.hint;

      expect(hint).toEqual(expect.objectContaining({ originalException: new Error('Test Error') }));
    });
  });

  describe('onUnhandledRejection', () => {
    test('unhandled rejected promise is captured with synthetical error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

      const [actualTrackingOptions] = mockEnable.mock.calls[0] || [];
      actualTrackingOptions?.onUnhandled?.(1, 'Test Error');

      await client.flush();
      const actualSyntheticError = client.hint?.syntheticException;

      expect(mockDisable).not.toHaveBeenCalled();
      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
          onHandled: expect.any(Function),
        }),
      );
      expect(mockEnable).toHaveBeenCalledTimes(1);
      expect((actualSyntheticError as ExtendedError).framesToPop).toBe(3);
    });

    test('error like unhandled rejected promise is captured without synthetical error', async () => {
      const integration = reactNativeErrorHandlersIntegration();
      integration.setupOnce();

      const [actualTrackingOptions] = mockEnable.mock.calls[0] || [];
      actualTrackingOptions?.onUnhandled?.(1, new Error('Test Error'));

      await client.flush();
      const actualSyntheticError = client.hint?.syntheticException;

      expect(mockDisable).not.toHaveBeenCalled();
      expect(mockEnable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
          onHandled: expect.any(Function),
        }),
      );
      expect(mockEnable).toHaveBeenCalledTimes(1);
      expect(actualSyntheticError).toBeUndefined();
    });
  });
});
