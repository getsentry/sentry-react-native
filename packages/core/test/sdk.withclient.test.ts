import { debug, setCurrentClient } from '@sentry/core';
import { crashedLastRun, flush } from '../src/js/sdk';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';
import { NATIVE } from './mockWrapper';

jest.mock('../src/js/wrapper.ts', () => jest.requireActual('./mockWrapper'));
jest.spyOn(debug, 'error');

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

      expect(client.flush).toHaveBeenCalled();
      expect(flushResult).toBe(true);
    });

    it('Returns false if flush failed and logs error', async () => {
      client.flush = jest.fn(() => Promise.reject());

      const flushResult = await flush();

      expect(client.flush).toHaveBeenCalled();
      expect(flushResult).toBe(false);
      expect(debug.error).toHaveBeenCalledWith('Failed to flush the event queue.');
    });
  });

  describe('crashedLastRun', () => {
    it('Returns Native crashedLastRun', async () => {
      NATIVE.crashedLastRun.mockClear().mockResolvedValue(true);
      expect(await crashedLastRun()).toBe(true);
      expect(NATIVE.crashedLastRun).toHaveBeenCalled();

      NATIVE.crashedLastRun.mockClear().mockResolvedValue(false);
      expect(await crashedLastRun()).toBe(false);
      expect(NATIVE.crashedLastRun).toHaveBeenCalled();

      NATIVE.crashedLastRun.mockClear().mockResolvedValue(null);
      expect(await crashedLastRun()).toBe(null);
      expect(NATIVE.crashedLastRun).toHaveBeenCalled();
    });
  });
});
