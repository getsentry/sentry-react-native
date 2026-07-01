/* oxlint-disable eslint(complexity), eslint(max-lines) */
import type { Client, Event, Integration, Span, SpanJSON, TransactionEvent } from '@sentry/core';

import {
  debug,
  getCapturedScopesOnSpan,
  getClient,
  getCurrentScope,
  getSpanDescendants,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  SPAN_STATUS_ERROR,
  spanIsSampled,
  spanToJSON,
  startInactiveSpan,
  timestampInSeconds,
} from '@sentry/core';

import type { NativeAppStartResponse, NativeFramesResponse } from '../../NativeRNSentry';
import type { ReactNativeClientOptions } from '../../options';

import { getAppRegistryIntegration } from '../../integrations/appRegistry';
import {
  APP_START_COLD as APP_START_COLD_MEASUREMENT,
  APP_START_WARM as APP_START_WARM_MEASUREMENT,
} from '../../measurements';
import { convertSpanToTransaction, isRootSpan, setEndTimeValue } from '../../utils/span';
import { NATIVE } from '../../wrapper';
import { getRootSpanDiscardReason, getTransactionEventDiscardReason } from '../onSpanEndUtils';
import {
  APP_START as APP_START_OP,
  APP_START_COLD as APP_START_COLD_OP,
  APP_START_EXTENDED as APP_START_EXTENDED_OP,
  APP_START_WARM as APP_START_WARM_OP,
  UI_LOAD as UI_LOAD_OP,
} from '../ops';
import { SPAN_ORIGIN_AUTO_APP_START, SPAN_ORIGIN_MANUAL_APP_START } from '../origin';
import { getCurrentReactNativeTracingIntegration } from '../reactnativetracing';
import {
  SEMANTIC_ATTRIBUTE_APP_VITALS_START_SCREEN,
  SEMANTIC_ATTRIBUTE_APP_VITALS_START_TYPE,
  SEMANTIC_ATTRIBUTE_APP_VITALS_START_VALUE,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
} from '../semanticAttributes';
import { setMainThreadInfo } from '../span';
import {
  createChildSpanJSON,
  createSpanJSON,
  getBundleStartTimestampMs,
  getLatestChildSpanEndTimestamp,
} from '../utils';

const INTEGRATION_NAME = 'AppStart';

export type AppStartIntegration = Integration & {
  captureStandaloneAppStart: () => Promise<void>;
  cancelDeferredStandaloneCapture: () => void;
  scheduleDeferredStandaloneCapture: () => void;
  extendAppStart: () => void;
  getExtendedAppStartSpan: () => Span;
  finishExtendedAppStart: () => Promise<void>;
};

/**
 * We filter out app start more than 60s.
 * This could be due to many different reasons.
 * We've seen app starts with hours, days and even months.
 */
const MAX_APP_START_DURATION_MS = 60_000;

/** We filter out App starts which timestamp is 60s and more before the transaction start */
const MAX_APP_START_AGE_MS = 60_000;

/** App Start transaction name */
const APP_START_TX_NAME = 'App Start';

/** Extended app start span name */
const EXTENDED_APP_START_SPAN_NAME = 'Extended App Start';

/**
 * If `finishExtendedAppStart()` is never called, the extended app start auto-finishes after this
 * deadline. The transaction is still captured, but its `app.vitals.start` measurement is suppressed
 * so we never emit a ~30s app start.
 */
const EXTEND_APP_START_DEADLINE_MS = 30_000;

interface AppStartEndData {
  timestampMs: number;
  endFrames: NativeFramesResponse | null;
}

let appStartEndData: AppStartEndData | undefined = undefined;
let isRecordedAppStartEndTimestampMsManual = false;
let isAppLoadedManuallyInvoked = false;

let rootComponentCreationTimestampMs: number | undefined = undefined;
let isRootComponentCreationTimestampMsManual = false;

/**
 * Records the application start end.
 * Used automatically by `Sentry.wrap` and `Sentry.ReactNativeProfiler`.
 *
 * @deprecated Use {@link appLoaded} from the public SDK API instead (`Sentry.appLoaded()`).
 */
export function captureAppStart(): Promise<void> {
  return _captureAppStart({ isManual: true });
}

/**
 * Signals that the app has finished loading and is ready for user interaction.
 * Called internally by `appLoaded()` from the public SDK API.
 *
 * @private
 */
export async function _appLoaded(): Promise<void> {
  if (isAppLoadedManuallyInvoked) {
    debug.warn('[AppStart] appLoaded() was already called. Subsequent calls are ignored.');
    return;
  }

  const client = getClient();
  if (!client) {
    debug.warn('[AppStart] appLoaded() was called before Sentry.init(). App start end will not be recorded.');
    return;
  }

  isAppLoadedManuallyInvoked = true;

  const timestampMs = timestampInSeconds() * 1000;

  // If auto-capture already ran (ReactNativeProfiler.componentDidMount), overwrite the timestamp.
  // The transaction hasn't been sent yet in non-standalone mode so this is safe.
  if (appStartEndData) {
    debug.log('[AppStart] appLoaded() overwriting auto-detected app start end timestamp.');
    appStartEndData.timestampMs = timestampMs;
    appStartEndData.endFrames = null;
  } else {
    _setAppStartEndData({ timestampMs, endFrames: null });
  }
  isRecordedAppStartEndTimestampMsManual = true;

  await fetchAndUpdateEndFrames();

  const integration = client.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME);
  if (integration) {
    // appLoaded() overrides the auto-detected end timestamp by cancelling the deferred standalone
    // send (if it hasn't fired yet) and sending a single transaction with the manual timestamp.
    // If the deferred send already fired, the standalone capture is already done, so the call
    // below bails — we keep the auto timestamp rather than emitting a duplicate.
    integration.cancelDeferredStandaloneCapture();
    await integration.captureStandaloneAppStart();
  }
}

/**
 * For internal use only.
 *
 * @private
 */
export async function _captureAppStart({ isManual }: { isManual: boolean }): Promise<void> {
  // If appLoaded() was already called manually, skip the auto-capture to avoid
  // overwriting the manual end timestamp (race B: appLoaded before componentDidMount).
  if (!isManual && isAppLoadedManuallyInvoked) {
    debug.log('[AppStart] Skipping auto app start capture because appLoaded() was already called.');
    return;
  }

  const client = getClient();
  if (!client) {
    debug.warn('[AppStart] Could not capture App Start, missing client.');
    return;
  }

  isRecordedAppStartEndTimestampMsManual = isManual;

  const timestampMs = timestampInSeconds() * 1000;

  // Set end timestamp immediately to avoid race with processEvent
  // Frames data will be updated after the async fetch
  _setAppStartEndData({
    timestampMs,
    endFrames: null,
  });

  await fetchAndUpdateEndFrames();

  const integration = client.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME);
  if (integration) {
    if (!isManual) {
      // For auto-capture, defer the standalone send to give appLoaded() a chance
      // to override the end timestamp before the transaction is sent.
      // If appLoaded() is called, it cancels this deferred send and sends its own.
      // In non-standalone mode, scheduleDeferredStandaloneCapture is a no-op.
      integration.scheduleDeferredStandaloneCapture();
    } else {
      await integration.captureStandaloneAppStart();
    }
  }
}

/**
 * Extends the app start window. Called internally by `extendAppStart()` from the public SDK API.
 *
 * @private
 */
export function _extendAppStart(): void {
  getClient()?.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME)?.extendAppStart();
}

/**
 * Returns the extended app start span (a no-op span when there's no active extension).
 * Called internally by `getExtendedAppStartSpan()` from the public SDK API.
 *
 * @private
 */
export function _getExtendedAppStartSpan(): Span {
  return (
    getClient()?.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME)?.getExtendedAppStartSpan() ??
    new SentryNonRecordingSpan()
  );
}

/**
 * Finishes the extended app start. Called internally by `finishExtendedAppStart()` from the public
 * SDK API.
 *
 * @private
 */
export async function _finishExtendedAppStart(): Promise<void> {
  await getClient()?.getIntegrationByName<AppStartIntegration>(INTEGRATION_NAME)?.finishExtendedAppStart();
}

/**
 * Fetches native frames data and attaches it to the current app start end data.
 */
async function fetchAndUpdateEndFrames(): Promise<void> {
  if (NATIVE.enableNative) {
    try {
      const endFrames = await NATIVE.fetchNativeFrames();
      debug.log('[AppStart] Captured end frames for app start.', endFrames);
      _updateAppStartEndFrames(endFrames);
    } catch (error) {
      debug.log('[AppStart] Failed to capture end frames for app start.', error);
    }
  }
}

/**
 * Sets the root component first constructor call timestamp.
 * Used automatically by `Sentry.wrap` and `Sentry.ReactNativeProfiler`.
 */
export function setRootComponentCreationTimestampMs(timestampMs: number): void {
  appStartEndData?.timestampMs && debug.warn('Setting Root component creation timestamp after app start end is set.');
  rootComponentCreationTimestampMs && debug.warn('Overwriting already set root component creation timestamp.');
  rootComponentCreationTimestampMs = timestampMs;
  isRootComponentCreationTimestampMsManual = true;
}

/**
 * For internal use only.
 *
 * @private
 */
export function _setRootComponentCreationTimestampMs(timestampMs: number): void {
  setRootComponentCreationTimestampMs(timestampMs);
  isRootComponentCreationTimestampMsManual = false;
}

/**
 * For internal use only.
 *
 * @private
 */
export const _setAppStartEndData = (data: AppStartEndData): void => {
  appStartEndData && debug.warn('Overwriting already set app start end data.');
  appStartEndData = data;
};

/**
 * Updates only the endFrames on existing appStartEndData.
 * Used after the async fetchNativeFrames completes to attach frame data
 * without triggering the overwrite warning from _setAppStartEndData.
 *
 * @private
 */
export const _updateAppStartEndFrames = (endFrames: NativeFramesResponse | null): void => {
  if (appStartEndData) {
    appStartEndData.endFrames = endFrames;
  }
};

/**
 * For testing purposes only.
 *
 * @private
 */
export function _clearRootComponentCreationTimestampMs(): void {
  rootComponentCreationTimestampMs = undefined;
}

/**
 * For testing purposes only.
 *
 * @private
 */
export function _clearAppStartEndData(): void {
  appStartEndData = undefined;
  isRecordedAppStartEndTimestampMsManual = false;
  isAppLoadedManuallyInvoked = false;
}

/**
 * Attaches frame data to a span's data object.
 */
function attachFrameDataToSpan(span: SpanJSON, frames: NativeFramesResponse): void {
  if (frames.totalFrames <= 0 && frames.slowFrames <= 0 && frames.frozenFrames <= 0) {
    debug.warn(`[AppStart] Detected zero slow or frozen frames. Not adding measurements to spanId (${span.span_id}).`);
    return;
  }
  span.data = span.data || {};
  span.data['frames.total'] = frames.totalFrames;
  span.data['frames.slow'] = frames.slowFrames;
  span.data['frames.frozen'] = frames.frozenFrames;

  debug.log('[AppStart] Attached frame data to span.', {
    spanId: span.span_id,
    frameData: {
      total: frames.totalFrames,
      slow: frames.slowFrames,
      frozen: frames.frozenFrames,
    },
  });
}

/**
 * Adds AppStart spans from the native layer to the transaction event.
 */
export const appStartIntegration = ({
  standalone = false,
}: {
  /**
   * Should the integration send App Start as a standalone root span (transaction)?
   * If false, App Start will be added as a child span to the first transaction.
   *
   * @default false
   */
  standalone?: boolean;
} = {}): AppStartIntegration => {
  let _client: Client | undefined = undefined;
  let isEnabled = true;
  let appStartDataFlushed = false;
  let afterAllSetupCalled = false;
  let firstStartedActiveRootSpanId: string | undefined = undefined;
  let firstStartedActiveRootSpan: Span | undefined = undefined;
  let cachedNativeAppStart: NativeAppStartResponse | null | undefined = undefined;
  let deferredStandaloneTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
  // Ensures at most one standalone `app.start` transaction per app run. Set synchronously at the
  // start of `captureStandaloneAppStart` (before any `await`), so a second trigger for the same run
  // — a late `appLoaded()`, or one racing the in-flight deferred auto-capture — observes it and
  // bails. Reset on `runApplication` so the next app run captures again.
  let standaloneAppStartCaptured = false;
  // Extend-app-start state (standalone mode). `extendAppStart()` keeps the standalone transaction
  // open and hosts an `app.start.extended` span for user-instrumented work; `finishExtendedAppStart()`
  // or the deadline finalizes it. `openStandaloneAppStartSpan` is the held-open root transaction.
  let extendedAppStartSpan: Span | undefined = undefined;
  let openStandaloneAppStartSpan: Span | undefined = undefined;
  let extendDeadlineTimeout: ReturnType<typeof setTimeout> | undefined = undefined;
  let extendedAppStartFinalized = false;

  const setup = (client: Client): void => {
    _client = client;
    const { enableAppStartTracking } = client.getOptions() as ReactNativeClientOptions;

    if (!enableAppStartTracking) {
      isEnabled = false;
      debug.warn('[AppStart] App start tracking is disabled.');
    }

    client.on('spanStart', recordFirstStartedActiveRootSpanId);
  };

  const afterAllSetup = (client: Client): void => {
    if (afterAllSetupCalled) {
      return;
    }
    afterAllSetupCalled = true;

    // TODO: automatically set standalone based on the presence of the native layer navigation integration

    getAppRegistryIntegration(client)?.onRunApplication(() => {
      // Reset once the current run's app start has begun capturing (flushed, or a standalone capture
      // started) so a remount / hot reload starts fresh for the new run. The initial runApplication
      // (root mount) fires before the first capture starts, so both are false then and we correctly
      // wait. For the non-standalone path `standaloneAppStartCaptured` is always false, so this
      // reduces to the original `appStartDataFlushed` check.
      if (appStartDataFlushed || standaloneAppStartCaptured) {
        debug.log('[AppStartIntegration] Resetting app start state based on runApplication call.');
        appStartDataFlushed = false;
        firstStartedActiveRootSpanId = undefined;
        firstStartedActiveRootSpan = undefined;
        isAppLoadedManuallyInvoked = false;
        cachedNativeAppStart = undefined;
        standaloneAppStartCaptured = false;
        extendedAppStartSpan = undefined;
        openStandaloneAppStartSpan = undefined;
        extendedAppStartFinalized = false;
        if (deferredStandaloneTimeout !== undefined) {
          clearTimeout(deferredStandaloneTimeout);
          deferredStandaloneTimeout = undefined;
        }
        if (extendDeadlineTimeout !== undefined) {
          clearTimeout(extendDeadlineTimeout);
          extendDeadlineTimeout = undefined;
        }
      } else {
        debug.log(
          '[AppStartIntegration] Waiting for initial app start was flush, before updating based on runApplication call.',
        );
      }
    });
  };

  const processEvent = async (event: Event): Promise<Event> => {
    if (!isEnabled || standalone) {
      return event;
    }

    if (event.type !== 'transaction') {
      // App start data is only relevant for transactions
      return event;
    }

    await attachAppStartToTransactionEvent(event as TransactionEvent);

    return event;
  };

  const recordFirstStartedActiveRootSpanId = (rootSpan: Span): void => {
    if (firstStartedActiveRootSpanId) {
      // Check if the previously locked span was dropped after it ended (e.g., by
      // ignoreEmptyRouteChangeTransactions or ignoreEmptyBackNavigation marking
      // it for discard during spanEnd). If so, reset and allow this new span.
      // We check here (at the next spanStart) rather than at spanEnd because
      // the discard listeners run after the app start listener in registration order,
      // so the discard attribute is not yet set when our own spanEnd listener would fire.
      if (firstStartedActiveRootSpan && getRootSpanDiscardReason(firstStartedActiveRootSpan) !== undefined) {
        debug.log(
          '[AppStart] Previously locked root span was marked for discard after ending. Resetting to allow next transaction.',
        );
        resetFirstStartedActiveRootSpanId();
        // Fall through to lock to this new span
      } else {
        return;
      }
    }

    if (!isRootSpan(rootSpan)) {
      return;
    }

    if (!spanIsSampled(rootSpan)) {
      return;
    }

    firstStartedActiveRootSpan = rootSpan;
    setFirstStartedActiveRootSpanId(rootSpan.spanContext().spanId);
  };

  /**
   * Resets the first started active root span id and span reference to allow
   * the next root span's transaction to attempt app start attachment.
   */
  const resetFirstStartedActiveRootSpanId = (): void => {
    debug.log('[AppStart] Resetting first started active root span id to allow retry on next transaction.');
    firstStartedActiveRootSpanId = undefined;
    firstStartedActiveRootSpan = undefined;
  };

  /**
   * For testing purposes only.
   * @private
   */
  const setFirstStartedActiveRootSpanId = (spanId: string | undefined): void => {
    firstStartedActiveRootSpanId = spanId;
    debug.log('[AppStart] First started active root span id recorded.', firstStartedActiveRootSpanId);
  };

  async function captureStandaloneAppStart(): Promise<void> {
    if (!_client) {
      // If client is not set, SDK was not initialized, logger is thus disabled
      // oxlint-disable-next-line eslint(no-console)
      console.warn('[AppStart] Could not capture App Start, missing client, call `Sentry.init` first.');
      return;
    }

    if (!standalone) {
      debug.log(
        '[AppStart] App start tracking is enabled. App start will be added to the first transaction as a child span.',
      );
      return;
    }

    if (standaloneAppStartCaptured) {
      // At most one standalone transaction per app run. Set synchronously below, so a second
      // trigger for the same run — a late appLoaded(), or one racing the in-flight deferred
      // auto-capture — bails here instead of emitting a duplicate.
      debug.log('[AppStart] Standalone app start already captured for this app run. Skipping.');
      return;
    }
    // Claimed synchronously (no await before this point) so a racing trigger observes it.
    standaloneAppStartCaptured = true;

    debug.log('[AppStart] App start tracking standalone root span (transaction).');

    if (!appStartEndData?.endFrames && NATIVE.enableNative) {
      try {
        const endFrames = await NATIVE.fetchNativeFrames();
        debug.log('[AppStart] Captured end frames for standalone app start.', endFrames);

        const currentTimestamp = appStartEndData?.timestampMs || timestampInSeconds() * 1000;
        _setAppStartEndData({
          timestampMs: currentTimestamp,
          endFrames,
        });
      } catch (error) {
        debug.log('[AppStart] Failed to capture frames for standalone app start.', error);
      }
    }

    const span = startInactiveSpan({
      forceTransaction: true,
      name: APP_START_TX_NAME,
      op: APP_START_OP,
    });
    if (span instanceof SentryNonRecordingSpan) {
      // Tracing is disabled or the transaction was sampled
      return;
    }

    setEndTimeValue(span, timestampInSeconds());
    _client.emit('spanEnd', span);

    const event = convertSpanToTransaction(span);
    if (!event) {
      debug.warn('[AppStart] Failed to convert App Start span to transaction.');
      return;
    }

    // If attachment was skipped (e.g. already flushed, or native data unavailable) there's nothing
    // to send. App start data is carried as Span V2 attributes on the root transaction, so the
    // standalone transaction is meaningful even without breakdown child spans.
    const attached = await attachAppStartToTransactionEvent(event);
    if (!attached) {
      debug.log('[AppStart] No app start data attached to the standalone transaction. Skipping send.');
      return;
    }

    const scope = getCapturedScopesOnSpan(span).scope || getCurrentScope();
    scope.captureEvent(event);
  }

  async function attachAppStartToTransactionEvent(
    event: TransactionEvent,
    { suppressMeasurement = false }: { suppressMeasurement?: boolean } = {},
  ): Promise<boolean> {
    if (appStartDataFlushed) {
      // App start data is only relevant for the first transaction of the app run
      debug.log('[AppStart] App start data already flushed. Skipping.');
      return false;
    }

    // Don't attach (and don't flip the flushed flag) for transactions the
    // tracing integration is about to drop — e.g. empty back-navigations,
    // route-change spans that never received route info, or childless idle
    // spans. Otherwise the next real transaction would be left without app
    // start data because `appStartDataFlushed` would already be `true`.
    if (getTransactionEventDiscardReason(event)) {
      debug.log('[AppStart] Skipping app start attach for transaction marked for discard.');
      return false;
    }

    if (!event.contexts?.trace) {
      debug.warn('[AppStart] Transaction event is missing trace context. Can not attach app start.');
      return false;
    }

    // When standalone is true, we create our own transaction and don't need to verify
    // it matches the first navigation transaction. When standalone is false, we need to
    // ensure we're attaching app start to the first transaction (not a later one).
    if (!standalone) {
      if (!firstStartedActiveRootSpanId) {
        debug.warn('[AppStart] No first started active root span id recorded. Can not attach app start.');
        return false;
      }

      if (firstStartedActiveRootSpanId !== event.contexts.trace.span_id) {
        debug.warn(
          '[AppStart] First started active root span id does not match the transaction event span id. Can not attached app start.',
        );
        return false;
      }
    }

    // All failure paths below set appStartDataFlushed = true to prevent
    // wasteful retries — these conditions won't change within the same app start.
    //
    // Use cached response if available (e.g. when _appLoaded() re-triggers
    // standalone capture after auto-capture already fetched from the native layer).
    // The native layer sets has_fetched = true after the first fetch, so a second
    // NATIVE.fetchNativeAppStart() call would incorrectly bail out.
    const isCached = cachedNativeAppStart !== undefined;
    const appStart = isCached ? cachedNativeAppStart : await NATIVE.fetchNativeAppStart();
    cachedNativeAppStart = appStart;
    if (!appStart) {
      debug.warn('[AppStart] Failed to retrieve the app start metrics from the native layer.');
      appStartDataFlushed = true;
      return false;
    }
    // Skip the has_fetched check when using a cached response — the native layer
    // sets has_fetched = true after the first fetch, but we intentionally re-use
    // the data when _appLoaded() overrides the app start end timestamp.
    if (!isCached && appStart.has_fetched) {
      debug.warn('[AppStart] Measured app start metrics were already reported from the native layer.');
      appStartDataFlushed = true;
      return false;
    }

    const appStartTimestampMs = appStart.app_start_timestamp_ms;
    if (!appStartTimestampMs) {
      debug.warn('[AppStart] App start timestamp could not be loaded from the native layer.');
      appStartDataFlushed = true;
      return false;
    }

    const appStartEndTimestampMs = appStartEndData?.timestampMs || getBundleStartTimestampMs();
    if (!appStartEndTimestampMs) {
      debug.warn(
        '[AppStart] Javascript failed to record app start end. `_setAppStartEndData` was not called nor could the bundle start be found.',
      );
      appStartDataFlushed = true;
      return false;
    }

    // The age check guards against attaching a stale app start to a much-later navigation
    // transaction. It is meaningless for standalone, where the transaction *is* the app start
    // and `event.start_timestamp` still reflects the span creation time at this point (it is
    // corrected to the native app start time further below). Applying it to standalone would
    // discard valid app starts on slow devices, so skip it there — the duration check below
    // still filters genuinely bogus (too long) app starts.
    const isAppStartWithinBounds =
      !!event.start_timestamp && appStartTimestampMs >= event.start_timestamp * 1_000 - MAX_APP_START_AGE_MS;
    if (!standalone && !__DEV__ && !isAppStartWithinBounds) {
      debug.warn('[AppStart] App start timestamp is too far in the past to be used for app start span.');
      appStartDataFlushed = true;
      return false;
    }

    const appStartDurationMs = appStartEndTimestampMs - appStartTimestampMs;
    if (!__DEV__ && appStartDurationMs >= MAX_APP_START_DURATION_MS) {
      // Dev builds can have long app start waiting over minute for the first bundle to be produced
      debug.warn('[AppStart] App start duration is over a minute long, not adding app start span.');
      appStartDataFlushed = true;
      return false;
    }

    if (appStartDurationMs < 0) {
      // This can happen when MainActivity on Android is recreated,
      // and the app start end timestamp is not updated, for example
      // due to missing `Sentry.wrap(RootComponent)` call.
      debug.warn(
        '[AppStart] Last recorded app start end timestamp is before the app start timestamp.',
        'This is usually caused by missing `Sentry.wrap(RootComponent)` call.',
      );
      appStartDataFlushed = true;
      return false;
    }

    appStartDataFlushed = true;

    const origin = isRecordedAppStartEndTimestampMsManual ? SPAN_ORIGIN_MANUAL_APP_START : SPAN_ORIGIN_AUTO_APP_START;
    // Standalone uses the Span V2 `app.start` op; non-standalone keeps the legacy `ui.load` op
    // on the carrier navigation transaction.
    const traceOp = standalone ? APP_START_OP : UI_LOAD_OP;

    event.contexts.trace.data = event.contexts.trace.data || {};
    event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_OP] = traceOp;
    event.contexts.trace.op = traceOp;
    event.contexts.trace.data[SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN] = origin;
    event.contexts.trace.origin = origin;

    const appStartTimestampSeconds = appStartTimestampMs / 1000;
    const appStartEndTimestampSeconds = appStartEndTimestampMs / 1000;
    event.start_timestamp = appStartTimestampSeconds;

    event.spans = event.spans || [];
    /** event.spans reference */
    const children: SpanJSON[] = event.spans;

    // Re-anchor the screen-load display spans to the process/app start time. These are only
    // present on the non-standalone `ui.load` transaction; a no-op for the standalone `app.start`.
    const maybeTtidSpan = children.find(({ op }) => op === 'ui.load.initial_display');
    if (maybeTtidSpan) {
      maybeTtidSpan.start_timestamp = appStartTimestampSeconds;
      setSpanDurationAsMeasurementOnTransactionEvent(event, 'time_to_initial_display', maybeTtidSpan);
    }

    const maybeTtfdSpan = children.find(({ op }) => op === 'ui.load.full_display');
    if (maybeTtfdSpan) {
      maybeTtfdSpan.start_timestamp = appStartTimestampSeconds;
      setSpanDurationAsMeasurementOnTransactionEvent(event, 'time_to_full_display', maybeTtfdSpan);
    }

    // Non-standalone only: extend the carrier transaction to cover the app start window if it ended
    // earlier. Standalone sets its end timestamp explicitly below.
    if (!standalone && event.timestamp && event.timestamp < appStartEndTimestampSeconds) {
      debug.log(
        '[AppStart] Transaction event timestamp is before app start end. Adjusting transaction event timestamp.',
      );
      event.timestamp = appStartEndTimestampSeconds;
    }

    // Parent of the app start breakdown spans (JS bundle execution, native init):
    // - Standalone (Span V2): the root `app.start` transaction itself, carrying the app start
    //   vitals as attributes. No legacy per-type span or `app_start_*` measurement is emitted —
    //   Relay backfills the V1 encoding from these attributes.
    // - Non-standalone (legacy V1): a dedicated `app.start.cold`/`app.start.warm` child span plus
    //   the `app_start_*` measurement, attached to the `ui.load` navigation transaction.
    let breakdownParent: SpanJSON;
    if (standalone) {
      // Bound the standalone transaction exactly to the app start window.
      event.timestamp = appStartEndTimestampSeconds;

      // The measurement is suppressed on the extended-app-start deadline path so we never emit a
      // bogus ~30s app start; the transaction itself is still captured.
      if (!suppressMeasurement) {
        event.contexts.trace.data[SEMANTIC_ATTRIBUTE_APP_VITALS_START_VALUE] = appStartDurationMs;
        event.contexts.trace.data[SEMANTIC_ATTRIBUTE_APP_VITALS_START_TYPE] = appStart.type;

        // Screen shown when app start completes. Unlike the non-standalone `ui.load` transaction
        // (whose name is the screen, which Relay backfills from), the standalone transaction is named
        // `App Start`, so we set the screen explicitly. Sourced from the current route tracked by the
        // tracing integration; omitted when no route has been registered yet at capture time.
        const screen = getCurrentReactNativeTracingIntegration()?.state.currentRoute;
        if (screen) {
          event.contexts.trace.data[SEMANTIC_ATTRIBUTE_APP_VITALS_START_SCREEN] = screen;
        }
      }

      // Minimal parent referencing the root transaction span, so the breakdown spans attach
      // directly under it (the helpers only read op/origin/span_id/trace_id/start_timestamp).
      // `data` is shared with the root trace context so frame data lands on the root span.
      breakdownParent = {
        op: traceOp,
        origin,
        span_id: event.contexts.trace.span_id,
        trace_id: event.contexts.trace.trace_id,
        start_timestamp: appStartTimestampSeconds,
        data: event.contexts.trace.data,
      };
    } else {
      breakdownParent = createSpanJSON({
        op: appStart.type === 'cold' ? APP_START_COLD_OP : APP_START_WARM_OP,
        description: appStart.type === 'cold' ? 'Cold Start' : 'Warm Start',
        start_timestamp: appStartTimestampSeconds,
        timestamp: appStartEndTimestampSeconds,
        trace_id: event.contexts.trace.trace_id,
        parent_span_id: event.contexts.trace.span_id,
        origin,
      });
    }

    if (appStartEndData?.endFrames) {
      attachFrameDataToSpan(breakdownParent, appStartEndData.endFrames);

      try {
        const framesDelay = await Promise.race([
          NATIVE.fetchNativeFramesDelay(appStartTimestampSeconds, appStartEndTimestampSeconds),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 2_000)),
        ]);
        if (framesDelay != null) {
          breakdownParent.data = breakdownParent.data || {};
          breakdownParent.data['frames.delay'] = framesDelay;
        }
      } catch (error) {
        debug.log('[AppStart] Error while fetching frames delay for app start span.', error);
      }
    }

    const jsExecutionSpanJSON = createJSExecutionStartSpan(breakdownParent, rootComponentCreationTimestampMs);

    const appStartSpans = [
      // In standalone mode the parent IS the root transaction, so it is not pushed as a child
      // span; only its breakdown children are added.
      ...(standalone ? [] : [breakdownParent]),
      ...(jsExecutionSpanJSON ? [jsExecutionSpanJSON] : []),
      ...convertNativeSpansToSpanJSON(breakdownParent, appStart.spans),
    ];

    children.push(...appStartSpans);
    debug.log('[AppStart] Added app start spans to transaction event.', JSON.stringify(appStartSpans, undefined, 2));

    if (!standalone && !suppressMeasurement) {
      const measurementKey = appStart.type === 'cold' ? APP_START_COLD_MEASUREMENT : APP_START_WARM_MEASUREMENT;
      const measurementValue = {
        value: appStartDurationMs,
        unit: 'millisecond',
      };
      event.measurements = event.measurements || {};
      event.measurements[measurementKey] = measurementValue;
      debug.log(
        '[AppStart] Added app start measurement to transaction event.',
        JSON.stringify(measurementValue, undefined, 2),
      );
    }

    return true;
  }

  /**
   * Ends any still-open descendant spans of the extended app start span with the given status.
   * Used when finalizing: open children are `cancelled` on an explicit finish, `deadline_exceeded`
   * when the deadline fires.
   */
  const finishOpenExtendedChildren = (statusMessage: 'cancelled' | 'deadline_exceeded'): void => {
    if (!extendedAppStartSpan) {
      return;
    }
    for (const child of getSpanDescendants(extendedAppStartSpan)) {
      if (child === extendedAppStartSpan || spanToJSON(child).timestamp !== undefined) {
        continue; // the extended span itself, or an already-finished child
      }
      child.setStatus({ code: SPAN_STATUS_ERROR, message: statusMessage });
      child.end();
    }
  };

  /**
   * Finalizes a held-open standalone `app.start` transaction (used by the extend flow): trims its
   * end to the latest finished child floored at the default app start end, enriches it with app
   * start data, and sends it. When `suppressMeasurement` is set (deadline path) the
   * `app.vitals.start` attributes are removed so we never emit a bogus ~30s app start, while the
   * transaction itself is still captured.
   */
  async function finalizeStandaloneAppStart(
    span: Span,
    { suppressMeasurement = false }: { suppressMeasurement?: boolean } = {},
  ): Promise<void> {
    if (!_client) {
      return;
    }

    // Trim the transaction end to the latest finished child, floored at the default app start end —
    // extending can only push the end later, never make it shorter than a non-extended app start.
    const defaultEndMs = appStartEndData?.timestampMs || getBundleStartTimestampMs();
    const latestChildEndSeconds = getLatestChildSpanEndTimestamp(span);
    const trimmedEndMs = Math.max(latestChildEndSeconds ? latestChildEndSeconds * 1000 : 0, defaultEndMs || 0);
    if (appStartEndData && trimmedEndMs) {
      // `attach` reads appStartEndData.timestampMs as the app start end for the measurement/timestamp.
      appStartEndData.timestampMs = trimmedEndMs;
    }

    setEndTimeValue(span, (trimmedEndMs || timestampInSeconds() * 1000) / 1000);
    _client.emit('spanEnd', span);

    const event = convertSpanToTransaction(span);
    if (!event) {
      debug.warn('[AppStart] Failed to convert extended App Start span to transaction.');
      return;
    }

    const attached = await attachAppStartToTransactionEvent(event, { suppressMeasurement });
    if (!attached) {
      debug.log('[AppStart] No app start data attached to the extended standalone transaction. Skipping send.');
      return;
    }

    const scope = getCapturedScopesOnSpan(span).scope || getCurrentScope();
    scope.captureEvent(event);
  }

  const finalizeExtendedAppStart = async ({
    deadlineExceeded = false,
  }: { deadlineExceeded?: boolean } = {}): Promise<void> => {
    if (!extendedAppStartSpan || !openStandaloneAppStartSpan || extendedAppStartFinalized) {
      return;
    }
    extendedAppStartFinalized = true;

    if (extendDeadlineTimeout !== undefined) {
      clearTimeout(extendDeadlineTimeout);
      extendDeadlineTimeout = undefined;
    }

    finishOpenExtendedChildren(deadlineExceeded ? 'deadline_exceeded' : 'cancelled');
    if (deadlineExceeded) {
      extendedAppStartSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'deadline_exceeded' });
    }
    extendedAppStartSpan.end();

    const spanToFinalize = openStandaloneAppStartSpan;
    extendedAppStartSpan = undefined;
    openStandaloneAppStartSpan = undefined;

    await finalizeStandaloneAppStart(spanToFinalize, { suppressMeasurement: deadlineExceeded });
  };

  const extendAppStart = (): void => {
    if (!_client) {
      // oxlint-disable-next-line eslint(no-console)
      console.warn('[AppStart] Could not extend App Start, missing client, call `Sentry.init` first.');
      return;
    }
    if (!standalone) {
      debug.warn('[AppStart] extendAppStart() requires standalone app start tracing. Ignoring.');
      return;
    }
    if (extendedAppStartSpan) {
      debug.log('[AppStart] extendAppStart() already called for this app run. Ignoring.');
      return;
    }
    if (standaloneAppStartCaptured) {
      debug.warn('[AppStart] extendAppStart() called after the app start transaction was created. Ignoring.');
      return;
    }

    // Take over the send: cancel the deferred auto-capture and claim the run so the normal capture
    // path does not also finalize/send.
    cancelDeferredStandaloneCapture();
    standaloneAppStartCaptured = true;

    const rootSpan = startInactiveSpan({
      forceTransaction: true,
      name: APP_START_TX_NAME,
      op: APP_START_OP,
    });
    if (rootSpan instanceof SentryNonRecordingSpan) {
      debug.log('[AppStart] extendAppStart(): standalone app start transaction is not recording.');
      return;
    }
    openStandaloneAppStartSpan = rootSpan;
    extendedAppStartSpan = startInactiveSpan({
      parentSpan: rootSpan,
      op: APP_START_EXTENDED_OP,
      name: EXTENDED_APP_START_SPAN_NAME,
    });

    extendDeadlineTimeout = setTimeout(() => {
      extendDeadlineTimeout = undefined;
      debug.warn('[AppStart] Extended app start deadline reached. Finalizing without a measurement.');
      // oxlint-disable-next-line typescript-eslint(no-floating-promises)
      finalizeExtendedAppStart({ deadlineExceeded: true });
    }, EXTEND_APP_START_DEADLINE_MS);
  };

  const getExtendedAppStartSpan = (): Span => {
    return extendedAppStartSpan || new SentryNonRecordingSpan();
  };

  const finishExtendedAppStart = async (): Promise<void> => {
    if (!extendedAppStartSpan || extendedAppStartFinalized) {
      debug.log('[AppStart] finishExtendedAppStart(): no extended app start in progress. Ignoring.');
      return;
    }
    await finalizeExtendedAppStart({ deadlineExceeded: false });
  };

  const cancelDeferredStandaloneCapture = (): void => {
    if (deferredStandaloneTimeout !== undefined) {
      clearTimeout(deferredStandaloneTimeout);
      deferredStandaloneTimeout = undefined;
      debug.log('[AppStart] Cancelled deferred standalone app start capture.');
    }
  };

  const scheduleDeferredStandaloneCapture = (): void => {
    if (!standalone) {
      return;
    }
    deferredStandaloneTimeout = setTimeout(() => {
      deferredStandaloneTimeout = undefined;
      // oxlint-disable-next-line typescript-eslint(no-floating-promises)
      captureStandaloneAppStart();
    }, 0);
  };

  return {
    name: INTEGRATION_NAME,
    setup,
    afterAllSetup,
    processEvent,
    captureStandaloneAppStart,
    cancelDeferredStandaloneCapture,
    scheduleDeferredStandaloneCapture,
    extendAppStart,
    getExtendedAppStartSpan,
    finishExtendedAppStart,
    setFirstStartedActiveRootSpanId,
  } as AppStartIntegration;
};

function setSpanDurationAsMeasurementOnTransactionEvent(event: TransactionEvent, label: string, span: SpanJSON): void {
  if (!span.timestamp || !span.start_timestamp) {
    debug.warn('Span is missing start or end timestamp. Cam not set measurement on transaction event.');
    return;
  }

  event.measurements = event.measurements || {};
  event.measurements[label] = {
    value: (span.timestamp - span.start_timestamp) * 1000,
    unit: 'millisecond',
  };
}

/**
 * Adds JS Execution before React Root. If `Sentry.wrap` is not used, create a span for the start of JS Bundle execution.
 */
function createJSExecutionStartSpan(
  parentSpan: SpanJSON,
  rootComponentCreationTimestampMs: number | undefined,
): SpanJSON | undefined {
  const bundleStartTimestampMs = getBundleStartTimestampMs();
  if (!bundleStartTimestampMs) {
    return undefined;
  }

  const bundleStartTimestampSeconds = bundleStartTimestampMs / 1000;
  if (bundleStartTimestampSeconds < parentSpan.start_timestamp) {
    debug.warn('Bundle start timestamp is before the app start span start timestamp. Skipping JS execution span.');
    return undefined;
  }

  if (!rootComponentCreationTimestampMs) {
    debug.warn('Missing the root component first constructor call timestamp.');
    return createChildSpanJSON(parentSpan, {
      description: 'JS Bundle Execution Start',
      start_timestamp: bundleStartTimestampSeconds,
      timestamp: bundleStartTimestampSeconds,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  }

  return createChildSpanJSON(parentSpan, {
    description: 'JS Bundle Execution Before React Root',
    start_timestamp: bundleStartTimestampSeconds,
    timestamp: rootComponentCreationTimestampMs / 1000,
    origin: isRootComponentCreationTimestampMsManual ? SPAN_ORIGIN_MANUAL_APP_START : SPAN_ORIGIN_AUTO_APP_START,
  });
}

/**
 * Adds native spans to the app start span.
 */
function convertNativeSpansToSpanJSON(parentSpan: SpanJSON, nativeSpans: NativeAppStartResponse['spans']): SpanJSON[] {
  return nativeSpans
    .filter(span => span.start_timestamp_ms / 1000 >= parentSpan.start_timestamp)
    .map(span => {
      if (span.description === 'UIKit init') {
        return setMainThreadInfo(createUIKitSpan(parentSpan, span));
      }

      return setMainThreadInfo(
        createChildSpanJSON(parentSpan, {
          description: span.description,
          start_timestamp: span.start_timestamp_ms / 1000,
          timestamp: span.end_timestamp_ms / 1000,
          origin: SPAN_ORIGIN_AUTO_APP_START,
        }),
      );
    });
}

/**
 * UIKit init is measured by the native layers till the native SDK start
 * RN initializes the native SDK later, the end timestamp would be wrong
 */
function createUIKitSpan(parentSpan: SpanJSON, nativeUIKitSpan: NativeAppStartResponse['spans'][number]): SpanJSON {
  const bundleStart = getBundleStartTimestampMs();

  // If UIKit init ends after the bundle start, the native SDK was auto-initialized
  // and so the end timestamp is incorrect.
  // The timestamps can't equal, as RN initializes after UIKit.
  if (bundleStart && bundleStart < nativeUIKitSpan.end_timestamp_ms) {
    return createChildSpanJSON(parentSpan, {
      description: 'UIKit Init to JS Exec Start',
      start_timestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
      timestamp: bundleStart / 1000,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  } else {
    return createChildSpanJSON(parentSpan, {
      description: 'UIKit Init',
      start_timestamp: nativeUIKitSpan.start_timestamp_ms / 1000,
      timestamp: nativeUIKitSpan.end_timestamp_ms / 1000,
      origin: SPAN_ORIGIN_AUTO_APP_START,
    });
  }
}
