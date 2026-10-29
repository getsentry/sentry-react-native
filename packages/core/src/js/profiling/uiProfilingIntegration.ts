import type { Client, Event, Integration, ProfileChunk, ProfileChunkEnvelope, Span } from '@sentry/core';

import {
  createEnvelope,
  debug,
  getRootSpan,
  getSdkMetadataForEnvelopeHeader,
  hasSpansEnabled,
  spanIsSampled,
  spanToJSON,
  uuid4,
} from '@sentry/core';
import { Platform } from 'react-native';

import type { ReactNativeClient } from '../client';
import type { ProfilingLifecycle, ProfilingOptions, ReactNativeClientOptions } from '../options';

import { isHermesEnabled } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { createHermesProfileChunk, HERMES_CHUNK_THREAD_ID } from './hermesProfileChunk';

// `Sentry.profiler` from `@sentry/core` looks the integration up by this name.
export const UI_PROFILING_INTEGRATION_NAME = 'ProfilingIntegration';

const SPAN_THREAD_ID = 'thread.id';

/**
 * The native SDKs ignore a start call that comes before a requested stop takes effect at the end
 * of the current 60 second chunk. Waiting one chunk before the stop call keeps back-to-back root
 * spans in one profile.
 */
export const TRACE_STOP_DELAY_MS = 60_000;

/** Matches the chunk duration of the native profilers. */
export const HERMES_CHUNK_DURATION_MS = 60_000;

/** sentry-java uses the Perfetto profiler from API 35. vroom can merge only its sample format with Hermes chunks. */
const MIN_HERMES_CHUNK_ANDROID_API = 35;

interface UIProfilingIntegration extends Integration {
  _profiler: {
    start: () => void;
    stop: () => void;
  };
}

interface ProfileSession {
  profilerId: Promise<string | null>;
}

interface HermesChunk {
  profilerId: string;
  startTimestampMs: number;
}

/** Returns the UI profiling options, including the deprecated `androidProfilingOptions`. */
export function getProfilingOptions(options: ReactNativeClientOptions): ProfilingOptions | undefined {
  return options._experiments?.profilingOptions ?? options._experiments?.androidProfilingOptions;
}

/**
 * Starts and stops the native UI profiler for `_experiments.profilingOptions`.
 *
 * The SDK adds this integration by default when `profilingOptions` is set. If you set
 * `defaultIntegrations: false`, add it to `integrations` to use UI profiling.
 *
 * @experimental
 */
export const uiProfilingIntegration = (): Integration => {
  const activeRootSpanIds = new Set<string>();
  const sessionByRootSpanId = new Map<string, ProfileSession>();
  let lifecycle: ProfilingLifecycle = 'manual';
  let startOnAppStart = false;
  let session: ProfileSession | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  let isNativeReady = false;
  let isManualRequested = false;
  let isAppStartPending = false;
  let jsThreadId: string | null = null;
  let resolveAppStartSession: ((profilerId: string | null) => void) | undefined;
  let profilingClient: Client | undefined;
  let sendsHermesChunks = false;
  let hermesChunk: HermesChunk | undefined;
  let hermesChunkTimeout: ReturnType<typeof setTimeout> | undefined;

  const shouldRun = (): boolean =>
    lifecycle === 'trace' ? isAppStartPending || activeRootSpanIds.size > 0 : isManualRequested;

  const clearStopTimeout = (): void => {
    clearTimeout(stopTimeout);
    stopTimeout = undefined;
  };

  const startHermesChunk = (profilerId: string): void => {
    try {
      if (!NATIVE.startProfiling(false)) {
        return;
      }
    } catch (error) {
      debug.warn('[Profiling] Failed to start the Hermes profiler.', error);
      return;
    }
    hermesChunk = { profilerId, startTimestampMs: Date.now() };
    hermesChunkTimeout = setTimeout(() => {
      collectHermesChunk();
      startHermesChunk(profilerId);
    }, HERMES_CHUNK_DURATION_MS);
  };

  const collectHermesChunk = (): void => {
    clearTimeout(hermesChunkTimeout);
    hermesChunkTimeout = undefined;
    const chunk = hermesChunk;
    hermesChunk = undefined;
    if (!chunk || !profilingClient) {
      return;
    }

    let profiles: ReturnType<typeof NATIVE.stopProfiling>;
    try {
      profiles = NATIVE.stopProfiling();
    } catch (error) {
      debug.warn('[Profiling] Failed to stop the Hermes profiler.', error);
      return;
    }
    const profileChunk =
      profiles &&
      createHermesProfileChunk(profiles.hermesProfile, chunk.startTimestampMs, chunk.profilerId, profilingClient);
    if (profileChunk) {
      sendProfileChunk(profilingClient, profileChunk);
    }
  };

  const startHermesChunks = (newSession: ProfileSession): void => {
    if (!sendsHermesChunks) {
      return;
    }
    newSession.profilerId.then(
      profilerId => {
        // The native SDK returns no id when it does not profile this session.
        if (profilerId && session === newSession) {
          startHermesChunk(profilerId);
        }
      },
      () => {},
    );
  };

  const stopNativeProfiler = (): void => {
    clearStopTimeout();
    collectHermesChunk();
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
        startHermesChunks(newSession);
        activeRootSpanIds.forEach(spanId => {
          // A root span that started under an earlier session keeps that profile.
          if (!sessionByRootSpanId.has(spanId)) {
            sessionByRootSpanId.set(spanId, newSession);
          }
        });
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
    // Sentry shows the profile of this thread for the span.
    if (jsThreadId && spanToJSON(span).data[SPAN_THREAD_ID] === undefined) {
      span.setAttribute(SPAN_THREAD_ID, jsThreadId);
    }
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
    // An unsampled root span also ends the app start profile, because it sends no transaction to profile.
    if (!activeRootSpanIds.delete(span.spanContext().spanId) && span !== getRootSpan(span)) {
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

  const integration: UIProfilingIntegration = {
    name: UI_PROFILING_INTEGRATION_NAME,
    setup(client: ReactNativeClient): void {
      profilingClient = client;
      const profilingOptions = getProfilingOptions(client.getOptions());
      if (!profilingOptions) {
        debug.warn('[Profiling] `_experiments.profilingOptions` is not set. UI profiling is disabled.');
        return;
      }
      // Native tracing is off in React Native, so the native SDKs run in manual mode and this
      // integration decides when the profiler runs, also for the `trace` lifecycle.
      lifecycle = profilingOptions.lifecycle ?? 'manual';
      startOnAppStart = profilingOptions.startOnAppStart ?? false;
      isManualRequested = lifecycle === 'manual' && startOnAppStart;
      isAppStartPending = lifecycle === 'trace' && startOnAppStart;

      sendsHermesChunks =
        Platform.OS === 'android' &&
        Number(Platform.Version) >= MIN_HERMES_CHUNK_ANDROID_API &&
        isHermesEnabled() &&
        // The transaction profiler uses the same Hermes sampler.
        client.getOptions().profilesSampleRate === undefined;

      const tracingEnabled = hasSpansEnabled(client.getOptions());
      if (tracingEnabled) {
        jsThreadId = sendsHermesChunks ? HERMES_CHUNK_THREAD_ID : NATIVE.getCurrentThreadId();
        client.on('spanStart', onSpanStart);
        client.on('spanEnd', onSpanEnd);
      } else if (lifecycle === 'trace') {
        debug.warn('[Profiling] `lifecycle` is set to "trace", but tracing is disabled. The profiler will not run.');
        isAppStartPending = false;
      }

      // The native SDK starts the app start profile before JS runs, so root spans that start before
      // native init belong to it. Its id is only available after native init.
      if (startOnAppStart && (lifecycle === 'manual' || tracingEnabled)) {
        session = {
          profilerId: new Promise(resolve => {
            resolveAppStartSession = resolve;
          }),
        };
        startHermesChunks(session);
      }

      client.on('afterInit', () => {
        isNativeReady = true;
        const resolve = resolveAppStartSession;
        resolveAppStartSession = undefined;
        if (resolve) {
          // The profiler already runs, so this call only returns its id.
          NATIVE.startProfiler().then(resolve, () => resolve(null));
        } else if (startOnAppStart) {
          stopNativeProfiler();
          return;
        }
        syncNativeProfiler();
      });

      client.on('close', () => {
        clearStopTimeout();
        collectHermesChunk();
        session = undefined;
        resolveAppStartSession?.(null);
      });
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
  return integration;
};

function sendProfileChunk(client: Client, chunk: ProfileChunk): void {
  const sdk = getSdkMetadataForEnvelopeHeader(client.getSdkMetadata());
  const envelope = createEnvelope<ProfileChunkEnvelope>(
    { event_id: uuid4(), sent_at: new Date().toISOString(), ...(sdk && { sdk }) },
    [[{ type: 'profile_chunk', platform: 'javascript' }, chunk]],
  );
  client.sendEnvelope(envelope).then(null, error => {
    debug.error('[Profiling] Failed to send the Hermes profile chunk.', error);
  });
}
