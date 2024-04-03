import { setCurrentClient } from '@sentry/core';
import type { ExtendedError, Integration, SeverityLevel } from '@sentry/types';

import { ReactNativeErrorHandlers } from '../../src/js/integrations/reactnativeerrorhandlers';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

interface MockedReactNativeErrorHandlers extends Integration {
  _loadRejectionTracking: jest.Mock<
    {
      disable: jest.Mock;
      enable: jest.Mock;
    },
    []
  >;
}

describe('ReactNativeErrorHandlers', () => {
  let client: TestClient;

  beforeEach(() => {
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

      const integration = new ReactNativeErrorHandlers();

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
      const integration = new ReactNativeErrorHandlers();
      const mockDisable = jest.fn();
      const mockEnable = jest.fn();
      (integration as unknown as MockedReactNativeErrorHandlers)._loadRejectionTracking = jest.fn(() => ({
        disable: mockDisable,
        enable: mockEnable,
      }));
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
      const integration = new ReactNativeErrorHandlers();
      const mockDisable = jest.fn();
      const mockEnable = jest.fn();
      (integration as unknown as MockedReactNativeErrorHandlers)._loadRejectionTracking = jest.fn(() => ({
        disable: mockDisable,
        enable: mockEnable,
      }));
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
