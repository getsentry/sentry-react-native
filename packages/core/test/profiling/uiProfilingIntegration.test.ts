import type { Envelope, Event } from '@sentry/core';

import {
  debug,
  getCurrentScope,
  profiler,
  setCurrentClient,
  spanToJSON,
  startInactiveSpan,
  startSpan,
} from '@sentry/core';
import { Platform } from 'react-native';

import type { ProfilingOptions } from '../../src/js/options';

import { HERMES_CHUNK_THREAD_ID } from '../../src/js/profiling/hermesProfileChunk';
import {
  HERMES_CHUNK_DURATION_MS,
  TRACE_STOP_DELAY_MS,
  uiProfilingIntegration,
} from '../../src/js/profiling/uiProfilingIntegration';
import { isHermesEnabled } from '../../src/js/utils/environment';
import { getDefaultTestClientOptions, setupTestClient, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';
import { createMockMinimalValidHermesProfile } from './fixtures';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('../../src/js/utils/environment', () => ({
  ...jest.requireActual('../../src/js/utils/environment'),
  isHermesEnabled: jest.fn(() => false),
}));

function setupClient(
  profilingOptions: ProfilingOptions,
  clientOptions: { tracesSampleRate?: number; profilesSampleRate?: number } = {},
): TestClient {
  return setupTestClient({
    ...clientOptions,
    _experiments: { profilingOptions },
    integrations: [uiProfilingIntegration()],
  });
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
    jest.restoreAllMocks();
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
          _experiments: { profilingOptions: { lifecycle: 'trace', startOnAppStart: true } },
          integrations: [uiProfilingIntegration()],
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
          _experiments: { profilingOptions: { lifecycle: 'manual', startOnAppStart: true } },
          integrations: [uiProfilingIntegration()],
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

  describe('without profilingOptions', () => {
    it('warns and does not control the native profiler', () => {
      const warn = jest.spyOn(debug, 'warn');

      setupTestClient({ integrations: [uiProfilingIntegration()] });
      startInactiveSpan({ name: 'root' }).end();
      profiler.startProfiler();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('`_experiments.profilingOptions` is not set'));
      expect(NATIVE.startProfiler).not.toHaveBeenCalled();
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
        getDefaultTestClientOptions({
          _experiments: { profilingOptions: { lifecycle: 'manual' } },
          integrations: [uiProfilingIntegration()],
        }),
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

  describe('Hermes profile chunks', () => {
    const PROFILER_ID = '0123456789abcdef0123456789abcdef';

    function getSentChunkItems(sendEnvelope: jest.SpyInstance): unknown[] {
      return sendEnvelope.mock.calls.map(([envelope]: [Envelope]) => envelope[1][0]);
    }

    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(35);
      (isHermesEnabled as jest.Mock).mockReturnValue(true);
      NATIVE.startProfiler.mockResolvedValue(PROFILER_ID);
      NATIVE.startProfiling.mockReturnValue(true);
      NATIVE.stopProfiling.mockReturnValue({ hermesProfile: createMockMinimalValidHermesProfile() });
    });

    afterEach(() => {
      (isHermesEnabled as jest.Mock).mockReturnValue(false);
      NATIVE.startProfiler.mockResolvedValue(null);
      NATIVE.startProfiling.mockReturnValue(false);
      NATIVE.stopProfiling.mockReturnValue(null);
    });

    it('sends the Hermes samples of a native profile session as a profile chunk', async () => {
      const client = setupClient({ lifecycle: 'manual' });
      const sendEnvelope = jest.spyOn(client, 'sendEnvelope');

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(0);
      profiler.stopProfiler();

      expect(NATIVE.startProfiling).toHaveBeenCalledExactlyOnceWith(false);
      expect(NATIVE.stopProfiling).toHaveBeenCalledTimes(1);
      expect(getSentChunkItems(sendEnvelope)).toEqual([
        [
          { type: 'profile_chunk', platform: 'javascript' },
          expect.objectContaining({ profiler_id: PROFILER_ID, platform: 'javascript' }),
        ],
      ]);
    });

    it('sends a chunk and restarts the Hermes sampler after each chunk duration', async () => {
      const client = setupClient({ lifecycle: 'manual' });
      const sendEnvelope = jest.spyOn(client, 'sendEnvelope');

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(HERMES_CHUNK_DURATION_MS);

      expect(NATIVE.stopProfiling).toHaveBeenCalledTimes(1);
      expect(NATIVE.startProfiling).toHaveBeenCalledTimes(2);
      expect(sendEnvelope).toHaveBeenCalledTimes(1);
    });

    it('starts the Hermes sampler for the app start profile after native init', async () => {
      setupClient({ lifecycle: 'manual', startOnAppStart: true });

      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiling).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('does not start the Hermes sampler when the native SDK does not profile the session', async () => {
      NATIVE.startProfiler.mockResolvedValue(null);
      setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiling).not.toHaveBeenCalled();
    });

    it('does not start the Hermes sampler when the session stops before the native start resolves', async () => {
      setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      profiler.stopProfiler();
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiling).not.toHaveBeenCalled();
    });

    it('does not start the Hermes sampler when the client closes before the native start resolves', async () => {
      const client = setupClient({ lifecycle: 'manual' });

      profiler.startProfiler();
      client.emit('close');
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiling).not.toHaveBeenCalled();
    });

    it('stops the Hermes sampler without sending a chunk when the client closes', async () => {
      const client = setupClient({ lifecycle: 'manual' });
      const sendEnvelope = jest.spyOn(client, 'sendEnvelope');

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(0);
      client.emit('close');

      expect(NATIVE.stopProfiling).toHaveBeenCalledTimes(1);
      expect(sendEnvelope).not.toHaveBeenCalled();
    });

    it('starts the Hermes sampler when transaction profiling has a zero sample rate', async () => {
      setupClient({ lifecycle: 'manual' }, { profilesSampleRate: 0 });

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiling).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('adds the Hermes chunk thread id to spans', () => {
      setupClient({ lifecycle: 'trace' });

      const span = startInactiveSpan({ name: 'root' });

      expect(spanToJSON(span).data['thread.id']).toBe(HERMES_CHUNK_THREAD_ID);
    });

    it.each([
      ['Android API 34', () => jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34), {}],
      ['iOS', () => jest.replaceProperty(Platform, 'OS', 'ios'), {}],
      ['JSC', () => (isHermesEnabled as jest.Mock).mockReturnValue(false), {}],
      ['transaction profiling', () => {}, { profilesSampleRate: 1 }],
    ])('does not start the Hermes sampler on %s', async (_, arrange, clientOptions) => {
      arrange();
      setupClient({ lifecycle: 'manual' }, clientOptions);

      profiler.startProfiler();
      await jest.advanceTimersByTimeAsync(0);

      expect(NATIVE.startProfiler).toHaveBeenCalledTimes(1);
      expect(NATIVE.startProfiling).not.toHaveBeenCalled();
    });
  });
});
