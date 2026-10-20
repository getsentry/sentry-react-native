import { debug, getCurrentScope, profiler, setCurrentClient, startInactiveSpan, startSpan } from '@sentry/core';

import type { ProfilingOptions } from '../../src/js/options';

import { uiProfilingIntegration } from '../../src/js/profiling/uiProfilingIntegration';
import { getDefaultTestClientOptions, setupTestClient, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

const flushPromises = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function setupClient(
  profilingOptions: ProfilingOptions,
  clientOptions: { tracesSampleRate?: number } = {},
): TestClient {
  return setupTestClient({ ...clientOptions, integrations: [uiProfilingIntegration(profilingOptions)] });
}

describe('uiProfilingIntegration', () => {
  afterEach(() => {
    jest.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  describe('trace lifecycle', () => {
    it('runs the native profiler while a sampled root span is active', () => {
      setupClient({ lifecycle: 'trace' });

      const span = startInactiveSpan({ name: 'root' });
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).not.toHaveBeenCalled();

      span.end();
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('keeps the profiler running until the last root span ends', () => {
      setupClient({ lifecycle: 'trace' });

      const first = startInactiveSpan({ name: 'first', forceTransaction: true });
      const second = startInactiveSpan({ name: 'second', forceTransaction: true });
      first.end();
      expect(NATIVE.stopProfiler).not.toHaveBeenCalled();

      second.end();
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('ignores child spans and unsampled root spans', () => {
      setupClient({ lifecycle: 'trace' }, { tracesSampleRate: 0 });

      startSpan({ name: 'unsampled' }, () => startInactiveSpan({ name: 'child' }).end());

      expect(NATIVE.startProfiler).not.toHaveBeenCalled();
    });

    it('adds the native profiler id to transactions', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('profiler-id');
      const client = setupClient({ lifecycle: 'trace' });

      const span = startInactiveSpan({ name: 'root' });
      await flushPromises();
      span.end();
      await client.flush();

      expect(client.event?.contexts?.profile).toEqual({ profiler_id: 'profiler-id' });
    });

    it('stops the app start profile after the first root span ends', () => {
      setupClient({ lifecycle: 'trace', startOnAppStart: true });
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);

      startInactiveSpan({ name: 'root' }).end();

      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('stops the app start profile when tracing is disabled', () => {
      const warn = jest.spyOn(debug, 'warn');

      setupClient({ lifecycle: 'trace', startOnAppStart: true }, { tracesSampleRate: undefined });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('tracing is disabled'));
      expect(NATIVE.startProfiler).not.toHaveBeenCalled();
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual lifecycle', () => {
    it('starts and stops the native profiler through Sentry.profiler', () => {
      setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);

      profiler.stopProfiler();
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('waits for the native SDK before it starts the profiler', () => {
      const client = new TestClient(
        getDefaultTestClientOptions({ integrations: [uiProfilingIntegration({ lifecycle: 'manual' })] }),
      );
      setCurrentClient(client);
      client.init();

      profiler.startProfiler();
      expect(NATIVE.startProfiler).not.toHaveBeenCalled();

      // @ts-expect-error Only available on ReactNativeClient
      client.emit('afterInit');
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
    });

    it('does not add the profiler id to transactions after the profiler stops', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('profiler-id');
      const client = setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      await flushPromises();
      profiler.stopProfiler();
      startInactiveSpan({ name: 'root' }).end();
      await client.flush();

      expect(client.event?.type).toBe('transaction');
      expect(client.event?.contexts?.profile).toBeUndefined();
    });
  });
});
