jest.spyOn(logger, 'error');

import { setCurrentClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { configureScope, flush } from '../src/js/sdk';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

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
});
