import type { Event, Integration, Span } from '@sentry/core';

import { debug, getRootSpan, hasSpansEnabled, spanIsSampled } from '@sentry/core';

import type { ReactNativeClient } from '../client';
import type { ProfilingOptions } from '../options';

import { NATIVE } from '../wrapper';

// `Sentry.profiler` from `@sentry/core` looks the integration up by this name.
const INTEGRATION_NAME = 'ProfilingIntegration';

/**
 * The native SDKs ignore a start call that comes before a requested stop takes effect at the end
 * of the current 60 second chunk. Waiting one chunk before the stop call keeps back-to-back root
 * spans in one profile.
 */
export const TRACE_STOP_DELAY_MS = 60_000;

interface UIProfilingIntegration extends Integration {
  _profiler: {
    start: () => void;
    stop: () => void;
  };
}

interface ProfileSession {
  profilerId: Promise<string | null>;
}

/**
 * Starts and stops the native UI profiler from JS.
 *
 * Native tracing is off in React Native, so the native SDKs cannot follow the `trace` lifecycle.
 * They run in manual mode, and this integration decides when the profiler runs.
 */
export const uiProfilingIntegration = ({
  lifecycle = 'manual',
  startOnAppStart = false,
}: ProfilingOptions): UIProfilingIntegration => {
  const activeRootSpanIds = new Set<string>();
  const sessionByRootSpanId = new Map<string, ProfileSession>();
  let session: ProfileSession | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  let isNativeReady = false;
  let isManualRequested = lifecycle === 'manual' && startOnAppStart;
  let isAppStartPending = lifecycle === 'trace' && startOnAppStart;

  const shouldRun = (): boolean =>
    lifecycle === 'trace' ? isAppStartPending || activeRootSpanIds.size > 0 : isManualRequested;

  const clearStopTimeout = (): void => {
    clearTimeout(stopTimeout);
    stopTimeout = undefined;
  };

  const stopNativeProfiler = (): void => {
    clearStopTimeout();
    session = undefined;
    NATIVE.stopProfiler().then(undefined, () => {});
  };

  const syncNativeProfiler = (): void => {
    if (!isNativeReady) {
      return;
    }

    if (shouldRun()) {
      clearStopTimeout();
      if (!session) {
        const newSession: ProfileSession = { profilerId: NATIVE.startProfiler() };
        session = newSession;
        activeRootSpanIds.forEach(spanId => sessionByRootSpanId.set(spanId, newSession));
      }
    } else if (session && !stopTimeout) {
      if (lifecycle === 'trace') {
        stopTimeout = setTimeout(stopNativeProfiler, TRACE_STOP_DELAY_MS);
      } else {
        stopNativeProfiler();
      }
    }
  };

  const onSpanStart = (span: Span): void => {
    if (span !== getRootSpan(span) || !spanIsSampled(span)) {
      return;
    }
    const { spanId } = span.spanContext();
    activeRootSpanIds.add(spanId);
    if (session) {
      sessionByRootSpanId.set(spanId, session);
    }
    syncNativeProfiler();
  };

  const onSpanEnd = (span: Span): void => {
    if (!activeRootSpanIds.delete(span.spanContext().spanId)) {
      return;
    }
    isAppStartPending = false;
    syncNativeProfiler();
  };

  const setManualRequested = (requested: boolean): void => {
    if (lifecycle === 'trace') {
      debug.warn('[Profiling] `lifecycle` is set to "trace". Manual profiler calls are ignored.');
      return;
    }
    isManualRequested = requested;
    syncNativeProfiler();
  };

  return {
    name: INTEGRATION_NAME,
    setup(client: ReactNativeClient): void {
      if (hasSpansEnabled(client.getOptions())) {
        client.on('spanStart', onSpanStart);
        client.on('spanEnd', onSpanEnd);
      } else if (lifecycle === 'trace') {
        debug.warn('[Profiling] `lifecycle` is set to "trace", but tracing is disabled. The profiler will not run.');
        isAppStartPending = false;
      }

      client.on('afterInit', () => {
        isNativeReady = true;
        if (startOnAppStart && !shouldRun()) {
          // The native SDK started the app start profile before JS ran.
          stopNativeProfiler();
          return;
        }
        syncNativeProfiler();
      });

      client.on('close', clearStopTimeout);
    },
    processEvent(event: Event): Event | PromiseLike<Event> {
      const rootSpanId = event.type === 'transaction' ? event.contexts?.trace?.span_id : undefined;
      const rootSpanSession = rootSpanId ? sessionByRootSpanId.get(rootSpanId) : undefined;
      if (!rootSpanId || !rootSpanSession) {
        return event;
      }

      sessionByRootSpanId.delete(rootSpanId);
      return rootSpanSession.profilerId.then(profilerId => {
        if (profilerId) {
          event.contexts = {
            ...event.contexts,
            // `ProfileContext` only types the `profile_id` of transaction-based profiles.
            profile: { ...event.contexts?.profile, profiler_id: profilerId } as NonNullable<
              Event['contexts']
            >['profile'],
          };
        }
        return event;
      });
    },
    _profiler: {
      start: () => setManualRequested(true),
      stop: () => setManualRequested(false),
    },
  };
};
