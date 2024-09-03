jest.spyOn(logger, 'error');
jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));

import { setCurrentClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { configureScope, crashedLastRun, flush } from '../src/js/sdk';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';
import { NATIVE } from './mockWrapper';

describe('Tests the SDK functionality', () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();

    jest.spyOn(client, 'flush');
  });

  describe('flush', () => {
    it('Calls flush on the client', async () => {
      const flushResult = await flush();

      expect(client.flush).toBeCalled();
      expect(flushResult).toBe(true);
    });

    it('Returns false if flush failed and logs error', async () => {
      client.flush = jest.fn(() => Promise.reject());

      const flushResult = await flush();

      expect(client.flush).toBeCalled();
      expect(flushResult).toBe(false);
      expect(logger.error).toBeCalledWith('Failed to flush the event queue.');
    });
  });

  describe('configureScope', () => {
    test('configureScope callback does not throw', () => {
      const mockScopeCallback = jest.fn(() => {
        throw 'Test error';
      });

      expect(() => configureScope(mockScopeCallback)).not.toThrow();
      expect(mockScopeCallback).toBeCalledTimes(1);
    });
  });

  describe('crashedLastRun', () => {
    it('Returns Native crashedLastRun', async () => {
      NATIVE.crashedLastRun.mockClear().mockResolvedValue(true);
      expect(await crashedLastRun()).toBe(true);
      expect(NATIVE.crashedLastRun).toBeCalled();

      NATIVE.crashedLastRun.mockClear().mockResolvedValue(false);
      expect(await crashedLastRun()).toBe(false);
      expect(NATIVE.crashedLastRun).toBeCalled();

      NATIVE.crashedLastRun.mockClear().mockResolvedValue(null);
      expect(await crashedLastRun()).toBe(null);
      expect(NATIVE.crashedLastRun).toBeCalled();
    });
  });
});
