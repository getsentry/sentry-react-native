import { setCurrentClient } from '@sentry/core';
import { logger } from '@sentry/utils';

import { flush } from '../src/js/sdk';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

jest.spyOn(logger, 'error');

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
});
