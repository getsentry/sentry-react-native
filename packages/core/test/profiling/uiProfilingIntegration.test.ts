import type { Event } from '@sentry/core';

import {
  debug,
  getCurrentScope,
  profiler,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';

import type { ProfilingOptions } from '../../src/js/options';

import { TRACE_STOP_DELAY_MS, uiProfilingIntegration } from '../../src/js/profiling/uiProfilingIntegration';
import { getDefaultTestClientOptions, setupTestClient, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));

function setupClient(
  profilingOptions: ProfilingOptions,
  clientOptions: { tracesSampleRate?: number } = {},
): TestClient {
  return setupTestClient({ ...clientOptions, integrations: [uiProfilingIntegration(profilingOptions)] });
}

function getTransaction(client: TestClient, name: string): Event | undefined {
  return client.eventQueue.find(event => event.transaction === name);
}

describe('uiProfilingIntegration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    getCurrentScope().setClient(undefined);
  });

  describe('trace lifecycle', () => {
    it('stops the native profiler one chunk after the last root span ends', () => {
      setupClient({ lifecycle: 'trace' });

      const span = startInactiveSpan({ name: 'root' });
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);

      span.end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS - 1);
      expect(NATIVE.stopProfiler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('keeps one profile for root spans that start before the stop delay ends', () => {
      setupClient({ lifecycle: 'trace' });

      startInactiveSpan({ name: 'first' }).end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS - 1);
      const second = startInactiveSpan({ name: 'second' });
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS);
      expect(NATIVE.stopProfiler).not.toHaveBeenCalled();

      second.end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS);
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('ignores child spans and unsampled root spans', () => {
      setupClient({ lifecycle: 'trace' }, { tracesSampleRate: 0 });

      startSpan({ name: 'unsampled' }, () => startInactiveSpan({ name: 'child' }).end());

      expect(NATIVE.startProfiler).not.toHaveBeenCalled();
    });

    it('adds the profiler id to a transaction that ends before the native start resolves', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('profiler-id');
      const client = setupClient({ lifecycle: 'trace' });

      startInactiveSpan({ name: 'root' }).end();
      await jest.runAllTimersAsync();

      expect(client.eventQueue).toHaveLength(1);
      expect(client.event?.contexts?.profile).toEqual({ profiler_id: 'profiler-id' });
    });

    it('does not add the id of a stopped profile to later transactions', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('profiler-id').mockResolvedValueOnce(null);
      const client = setupClient({ lifecycle: 'trace' });

      startInactiveSpan({ name: 'first' }).end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS);
      startInactiveSpan({ name: 'second' }).end();
      await jest.runAllTimersAsync();

      expect(client.eventQueue).toHaveLength(2);
      expect(getTransaction(client, 'first')?.contexts?.profile).toEqual({ profiler_id: 'profiler-id' });
      expect(getTransaction(client, 'second')?.contexts?.profile).toBeUndefined();
    });

    it('stops the app start profile after the first root span ends', () => {
      setupClient({ lifecycle: 'trace', startOnAppStart: true });
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);

      startInactiveSpan({ name: 'root' }).end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS);

      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('stops the app start profile when the first root span is not sampled', () => {
      setupClient({ lifecycle: 'trace', startOnAppStart: true }, { tracesSampleRate: 0 });
      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);

      startInactiveSpan({ name: 'unsampled' }).end();
      jest.advanceTimersByTime(TRACE_STOP_DELAY_MS);

      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('links a root span that ends before native init to the app start profile', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('app-start-profiler-id');
      const client = new TestClient(
        getDefaultTestClientOptions({
          tracesSampleRate: 1.0,
          integrations: [uiProfilingIntegration({ lifecycle: 'trace', startOnAppStart: true })],
        }),
      );
      setCurrentClient(client);
      client.init();

      startInactiveSpan({ name: 'early' }).end();
      // @ts-expect-error Only available on ReactNativeClient
      client.emit('afterInit');
      await jest.advanceTimersByTimeAsync(0);

      expect(getTransaction(client, 'early')?.contexts?.profile).toEqual({ profiler_id: 'app-start-profiler-id' });
      expect(NATIVE.stopProfiler).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(TRACE_STOP_DELAY_MS);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });

    it('stops the app start profile after the profiler id call when manual stop comes before native init', async () => {
      const client = new TestClient(
        getDefaultTestClientOptions({
          integrations: [uiProfilingIntegration({ lifecycle: 'manual', startOnAppStart: true })],
        }),
      );
      setCurrentClient(client);
      client.init();

      profiler.stopProfiler();
      // @ts-expect-error Only available on ReactNativeClient
      client.emit('afterInit');
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.startProfiler.mock.invocationCallOrder[0]).toBeLessThan(
        NATIVE.stopProfiler.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('stops the app start profile when tracing is disabled', () => {
      const warn = jest.spyOn(debug, 'warn');

      setupClient({ lifecycle: 'trace', startOnAppStart: true }, { tracesSampleRate: undefined });

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('tracing is disabled'));
      expect(NATIVE.startProfiler).not.toHaveBeenCalled();
      expect(NATIVE.stopProfiler).toHaveBeenCalledTimes(1);
    });
  });

  describe('thread id', () => {
    it('adds the native JS thread id to spans', async () => {
      NATIVE.getCurrentThreadId.mockReturnValueOnce('4242');
      const client = setupClient({ lifecycle: 'trace' });

      startSpan({ name: 'root' }, () => startInactiveSpan({ name: 'child' }).end());
      await jest.runAllTimersAsync();

      expect(client.event?.contexts?.trace?.data?.['thread.id']).toBe('4242');
      expect(client.event?.spans?.[0]?.data?.['thread.id']).toBe('4242');
    });

    it('keeps a thread id that the span already has', () => {
      NATIVE.getCurrentThreadId.mockReturnValueOnce('4242');
      setupClient({ lifecycle: 'trace' });

      const span = startInactiveSpan({ name: 'root', attributes: { 'thread.id': '1' } });

      expect(spanToJSON(span).data['thread.id']).toBe('1');
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

    it('adds the profiler id only to transactions that start while the profiler runs', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('profiler-id');
      const client = setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      const profiled = startInactiveSpan({ name: 'profiled' });
      profiler.stopProfiler();
      profiled.end();
      startInactiveSpan({ name: 'not profiled' }).end();
      await jest.runAllTimersAsync();

      expect(client.eventQueue).toHaveLength(2);
      expect(getTransaction(client, 'profiled')?.contexts?.profile).toEqual({ profiler_id: 'profiler-id' });
      expect(getTransaction(client, 'not profiled')?.contexts?.profile).toBeUndefined();
    });

    it('keeps the profiler id of the session that was running when the root span started', async () => {
      NATIVE.startProfiler.mockResolvedValueOnce('first-profiler-id').mockResolvedValueOnce('second-profiler-id');
      const client = setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      const span = startInactiveSpan({ name: 'root' });
      profiler.stopProfiler();
      profiler.startProfiler();
      span.end();
      await jest.runAllTimersAsync();

      expect(getTransaction(client, 'root')?.contexts?.profile).toEqual({ profiler_id: 'first-profiler-id' });
    });
  });
});
