import type { Event, Integration, Span } from '@sentry/core';

import { debug, getRootSpan, hasSpansEnabled, spanIsSampled } from '@sentry/core';

import type { ReactNativeClient } from '../client';
import type { ProfilingOptions } from '../options';

import { NATIVE } from '../wrapper';

// `Sentry.profiler` from `@sentry/core` looks the integration up by this name.
const INTEGRATION_NAME = 'ProfilingIntegration';

interface UIProfilingIntegration extends Integration {
  _profiler: {
    start: () => void;
    stop: () => void;
  };
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
  let isNativeReady = false;
  let isRunning = false;
  let isManualRequested = lifecycle === 'manual' && startOnAppStart;
  let isAppStartPending = lifecycle === 'trace' && startOnAppStart;
  let profilerId: string | undefined;

  const shouldRun = (): boolean =>
    lifecycle === 'trace' ? isAppStartPending || activeRootSpanIds.size > 0 : isManualRequested;

  const syncNativeProfiler = (): void => {
    if (!isNativeReady || shouldRun() === isRunning) {
      return;
    }

    isRunning = !isRunning;
    if (isRunning) {
      NATIVE.startProfiler().then(
        id => {
          if (isRunning) {
            profilerId = id ?? undefined;
          }
        },
        () => {},
      );
    } else {
      // In trace mode, the transaction that ended the profile is processed after this call and must keep the id.
      if (lifecycle === 'manual') {
        profilerId = undefined;
      }
      NATIVE.stopProfiler().then(undefined, () => {});
    }
  };

  const onSpanStart = (span: Span): void => {
    if (span !== getRootSpan(span) || !spanIsSampled(span)) {
      return;
    }
    activeRootSpanIds.add(span.spanContext().spanId);
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
      if (lifecycle === 'trace') {
        if (hasSpansEnabled(client.getOptions())) {
          client.on('spanStart', onSpanStart);
          client.on('spanEnd', onSpanEnd);
        } else {
          debug.warn('[Profiling] `lifecycle` is set to "trace", but tracing is disabled. The profiler will not run.');
          isAppStartPending = false;
        }
      }

      client.on('afterInit', () => {
        isNativeReady = true;
        if (startOnAppStart && !shouldRun()) {
          // The native SDK started the app start profile before JS ran.
          NATIVE.stopProfiler().then(undefined, () => {});
          return;
        }
        syncNativeProfiler();
      });
    },
    processEvent(event: Event): Event {
      if (event.type === 'transaction' && profilerId) {
        event.contexts = {
          ...event.contexts,
          // `ProfileContext` only types the `profile_id` of transaction-based profiles.
          profile: { ...event.contexts?.profile, profiler_id: profilerId } as NonNullable<Event['contexts']>['profile'],
        };
      }
      return event;
    },
    _profiler: {
      start: () => setManualRequested(true),
      stop: () => setManualRequested(false),
    },
  };
};
