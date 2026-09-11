import type {
  Breadcrumb,
  BreadcrumbHint,
  Client,
  DynamicSamplingContext,
  ErrorEvent,
  Event,
  EventHint,
  Metric,
} from '@sentry/core';

import { debug } from '@sentry/core';

import type { ResolvedNetworkOptions } from './networkUtils';
import type { Replay } from './replayInterface';

import { isHardCrash } from '../misc';
import { deferBreadcrumbNativeSync, syncBreadcrumbToNative } from '../scopeSync';
import { hasHooks } from '../utils/clientutils';
import { isExpoGo, notMobileOs } from '../utils/environment';
import { registerFeatureMarker } from '../utils/featureMarkers';
import { NATIVE } from '../wrapper';
import {
  buildResolvedNetworkBreadcrumb,
  makeEnrichXhrBreadcrumbsForMobileReplay,
  resolveXhrResponseBody,
  shouldCaptureResponseBodyAsync,
} from './xhrUtils';

const MOBILE_REPLAY_NETWORK_DETAILS_INTEGRATION_NAME = 'MobileReplayNetworkDetails';
const MOBILE_REPLAY_NETWORK_BODIES_INTEGRATION_NAME = 'MobileReplayNetworkBodies';

export const MOBILE_REPLAY_INTEGRATION_NAME = 'MobileReplay';

/**
 * Screenshot strategy type for Android Session Replay.
 *
 * - `'canvas'`: Canvas-based screenshot strategy. This strategy does **not** support any masking options, it always masks text and images. Use this if your application has strict PII requirements.
 * - `'pixelCopy'`: Pixel copy screenshot strategy (default). Supports all masking options.
 */
export type ScreenshotStrategy = 'canvas' | 'pixelCopy';

export interface MobileReplayOptions {
  /**
   * Mask all text in recordings
   *
   * @default true
   */
  maskAllText?: boolean;

  /**
   * Mask all images in recordings
   *
   * @default true
   */
  maskAllImages?: boolean;

  /**
   * Mask all vector graphics in recordings
   * Supports `react-native-svg`
   *
   * @default true
   */
  maskAllVectors?: boolean;

  /**
   * Enables the up to 5x faster experimental view renderer used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag.
   *
   * - Experiment: This is an experimental feature and is therefore disabled by default.
   *
   * @deprecated Use `enableViewRendererV2` instead.
   * @platform ios
   */
  enableExperimentalViewRenderer?: boolean;

  /**
   * Enables up to 5x faster new view renderer used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag. [Our benchmarks](https://github.com/getsentry/sentry-cocoa/pull/4940) have shown a significant improvement of
   * **up to 4-5x faster rendering** (reducing `~160ms` to `~36ms` per frame) on older devices.
   *
   * - Experiment: In case you are noticing issues with the new view renderer, please report the issue on [GitHub](https://github.com/getsentry/sentry-cocoa).
   *               Eventually, we will remove this feature flag and use the new view renderer by default.
   *
   * @default true
   * @platform ios
   */
  enableViewRendererV2?: boolean;

  /**
   * Enables up to 5x faster but incomplete view rendering used by the Session Replay integration on iOS.
   *
   * Enabling this flag will reduce the amount of time it takes to render each frame of the session replay on the main thread, therefore reducing
   * interruptions and visual lag.
   *
   * - Note: This flag only has an effect when `enableViewRendererV2` is enabled, with up to 20% faster render times.
   * - Experiment: This is an experimental feature and is therefore disabled by default.
   *
   * @default false
   * @platform ios
   */
  enableFastViewRendering?: boolean;

  /**
   * Array of view class names to include in subtree traversal during session replay and screenshot capture on iOS.
   *
   * Only views that are instances of these classes (or subclasses) will be traversed.
   * This helps prevent crashes when traversing problematic view hierarchies by allowing you to explicitly include only safe view classes.
   *
   * If both `includedViewClasses` and `excludedViewClasses` are set, `excludedViewClasses` takes precedence:
   * views matching excluded classes won't be traversed even if they match an included class.
   *
   * @default undefined
   * @platform ios
   */
  includedViewClasses?: string[];

  /**
   * Array of view class names to exclude from subtree traversal during session replay and screenshot capture on iOS.
   *
   * Views of these classes (or subclasses) will be skipped entirely, including all their children.
   * This helps prevent crashes when traversing problematic view hierarchies by allowing you to explicitly exclude problematic view classes.
   *
   * If both `includedViewClasses` and `excludedViewClasses` are set, `excludedViewClasses` takes precedence:
   * views matching excluded classes won't be traversed even if they match an included class.
   *
   * @default undefined
   * @platform ios
   */
  excludedViewClasses?: string[];

  /**
   * Sets the screenshot strategy used by the Session Replay integration on Android.
   *
   * If your application has strict PII requirements we recommend using `'canvas'`.
   * This strategy does **not** support any masking options, it always masks text and images.
   *
   * - Experiment: In case you are noticing issues with the canvas screenshot strategy, please report the issue on [GitHub](https://github.com/getsentry/sentry-java).
   *
   * @default 'pixelCopy'
   * @platform android
   */
  screenshotStrategy?: ScreenshotStrategy;

  /**
   * Enables capturing `SurfaceView` content in Session Replay on Android.
   *
   * This allows replays to include content from components that render outside the normal
   * View hierarchy (e.g. video players, map SDKs) which otherwise appear as black regions.
   *
   * - Experiment: Masking granularity is at the `SurfaceView` level only.
   * - Note: Only works with the `pixelCopy` screenshot strategy (the default).
   *
   * @default false
   * @platform android
   */
  captureSurfaceViews?: boolean;

  /**
   * Callback to determine if a replay should be captured for a specific error.
   * When this callback returns `false`, no replay will be captured for the error.
   * This callback is only called when an error occurs and `replaysOnErrorSampleRate` is set.
   *
   * @param event The error event
   * @param hint Additional event information
   * @returns `false` to skip capturing a replay for this error, `true` or `undefined` to proceed with sampling
   */
  beforeErrorSampling?: (event: Event, hint: EventHint) => boolean;

  /**
   * List of URLs (string match or RegExp) for which request and response details
   * (headers and, when `networkCaptureBodies` is true, bodies) are captured and
   * surfaced in the Replay network tab.
   *
   * String matches use substring matching; RegExp must match via `.test(url)`.
   * Bodies are only captured for URLs that match `networkDetailAllowUrls` and
   * do not match `networkDetailDenyUrls`.
   *
   * Authorization-like headers (`authorization`, `cookie`, `set-cookie`,
   * `x-api-key`, `x-auth-token`, `proxy-authorization`) are always stripped.
   *
   * Both `XMLHttpRequest` (this covers `axios` and similar libraries) and
   * `fetch` are supported — React Native's `fetch` is a polyfill built on
   * `XMLHttpRequest`. Response bodies returned as `Blob`/`ArrayBuffer` (which is
   * every `fetch` response) are read asynchronously and inlined when the
   * `content-type` is text-like (JSON, XML, `text/*`, form data); genuinely
   * binary payloads stay marked as unparseable. Request bodies passed as
   * `Blob`/`ArrayBuffer` are not inlined yet.
   *
   * Note: `RegExp` patterns are matched in JavaScript for request enrichment, but
   * only their string source is forwarded to the native SDKs (a `RegExp` can't
   * cross the native bridge). The native side uses these forwarded values only to
   * signal the Sentry frontend that captured details should be rendered.
   *
   * @default []
   */
  networkDetailAllowUrls?: (string | RegExp)[];

  /**
   * URLs (string match or RegExp) to exclude from network detail capture even
   * if they match `networkDetailAllowUrls`. Use this to prevent capturing
   * details for known-sensitive endpoints.
   *
   * @default []
   */
  networkDetailDenyUrls?: (string | RegExp)[];

  /**
   * If request and response bodies should be captured for URLs matched by
   * `networkDetailAllowUrls`. Enabled by default — set to `false` to capture
   * only headers for allow-listed URLs when you cannot tolerate body payloads
   * being recorded.
   *
   * Bodies are truncated at ~150 KB; truncated payloads include a
   * `MAX_BODY_SIZE_EXCEEDED` warning. URLs only enter the capture path after
   * being explicitly allow-listed via `networkDetailAllowUrls`, so the
   * default-on behaviour does not implicitly capture every request body.
   *
   * Aligned with the iOS and Android native SDK defaults.
   *
   * @default true
   */
  networkCaptureBodies?: boolean;

  /**
   * Additional request headers (case-insensitive names) to capture for matched
   * URLs in addition to the defaults (`content-type`, `content-length`, `accept`).
   *
   * Note: only headers explicitly set on the `XMLHttpRequest` via
   * `setRequestHeader` are observable; browser-managed headers are not.
   *
   * @default []
   */
  networkRequestHeaders?: string[];

  /**
   * Additional response headers (case-insensitive names) to capture for matched
   * URLs in addition to the defaults (`content-type`, `content-length`, `accept`).
   *
   * @default []
   */
  networkResponseHeaders?: string[];
}

const defaultOptions: MobileReplayOptions = {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
  enableExperimentalViewRenderer: false,
  enableViewRendererV2: true,
  enableFastViewRendering: false,
  screenshotStrategy: 'pixelCopy',
  networkDetailAllowUrls: [],
  networkDetailDenyUrls: [],
  networkCaptureBodies: true,
  networkRequestHeaders: [],
  networkResponseHeaders: [],
};

function mergeOptions(initOptions: Partial<MobileReplayOptions>): MobileReplayOptions {
  const merged = {
    ...defaultOptions,
    ...initOptions,
  };

  if (initOptions.enableViewRendererV2 === undefined && initOptions.enableExperimentalViewRenderer !== undefined) {
    merged.enableViewRendererV2 = initOptions.enableExperimentalViewRenderer;
  }

  return merged;
}

type MobileReplayIntegration = Replay & {
  options: MobileReplayOptions;
  getReplayId: () => string | null;
};

/**
 * Network detail allow/deny lists accept `RegExp` in JS, but the native bridge
 * can only serialize strings (a `RegExp` becomes `{}` when crossing the bridge).
 *
 * Convert `RegExp` entries to their `source` string so the native SDK can
 * populate its `SentryReplayOptions`, which is what emits the rrweb options
 * event that tells the Sentry frontend to render captured request/response
 * details. The JS-side matching in `xhrUtils` keeps using the original
 * `RegExp` values, so this normalization only affects native signaling.
 */
export function serializeNetworkDetailUrlsForNative(urls: (string | RegExp)[] | undefined): string[] {
  if (!urls) {
    return [];
  }
  return urls.map(url => (typeof url === 'string' ? url : url.source)).filter(url => url.length > 0);
}

/**
 * The Mobile Replay Integration, let's you adjust the default mobile replay options.
 * To be passed to `Sentry.init` with `replaysOnErrorSampleRate` or `replaysSessionSampleRate`.
 *
 * ```javascript
 * Sentry.init({
 *  replaysOnErrorSampleRate: 1.0,
 *  replaysSessionSampleRate: 1.0,
 *  integrations: [mobileReplayIntegration({
 *    // Adjust the default options
 *  })],
 * });
 * ```
 */
export const mobileReplayIntegration = (initOptions: MobileReplayOptions = defaultOptions): MobileReplayIntegration => {
  if (isExpoGo()) {
    debug.warn(
      `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`,
    );
  }
  if (notMobileOs()) {
    debug.warn(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} is not supported on this platform.`);
  }

  if (isExpoGo() || notMobileOs()) {
    return mobileReplayIntegrationNoop();
  }

  const options = mergeOptions(initOptions);

  // Cache the replay ID in JavaScript to avoid excessive bridge calls
  // This will be updated when we know the replay ID changes (e.g., after captureReplay)
  let cachedReplayId: string | null = null;

  function updateCachedReplayId(replayId: string | null): void {
    cachedReplayId = replayId;
  }

  // Invalidate the cache so the next `getReplayId()` re-reads the native replay
  // id. The runtime controls (`start`/`startBuffering`/`stop`/`flush`) change the
  // native replay identity, so a previously cached id would otherwise go stale and
  // link traces/logs/metrics to an inactive or previous replay.
  function invalidateCachedReplayId(): void {
    cachedReplayId = null;
  }

  function getCachedReplayId(): string | null {
    if (cachedReplayId !== null) {
      return cachedReplayId;
    }
    const nativeReplayId = NATIVE.getCurrentReplayId();
    if (nativeReplayId) {
      cachedReplayId = nativeReplayId;
    }
    return nativeReplayId;
  }

  // Error `sampleRate` sampling runs AFTER `beforeSend` in `@sentry/core`
  // (since 10.70.0, getsentry/sentry-javascript#22819). Flushing the buffered
  // replay inside `beforeSend` therefore uploads a replay even for errors that
  // are then dropped by `sampleRate`, orphaning the replay (issue #6598).
  //
  // The work is split in two:
  //   1. `tagEventWithReplayId` runs in the `beforeSend` wrapper and only links
  //      the event to the buffered replay id (no flush).
  //   2. `flushReplayForSentEvent` runs in `afterSendEvent`, which fires only
  //      for events that survive sampling and are actually sent, and performs
  //      the native flush there.
  //
  // Trade-off: the link is tagged optimistically from the buffered id before the
  // native `replaysOnErrorSampleRate` roll (which still happens at flush time in
  // `captureReplay`). If that roll misses, the event carries a `replay_id` for a
  // replay that is never uploaded. A fully-correct fix requires the native SDKs
  // to decouple the on-error sampling decision from the buffer upload.

  function tagEventWithReplayId(event: ErrorEvent, hint: EventHint): ErrorEvent {
    const hasException = event.exception?.values && event.exception.values.length > 0;
    if (!hasException) {
      // Event is not an error, will not capture replay
      return event;
    }

    // Check if beforeErrorSampling callback filters out this error
    if (initOptions.beforeErrorSampling) {
      try {
        if (initOptions.beforeErrorSampling(event, hint) === false) {
          debug.log(
            `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} not sent; beforeErrorSampling conditions not met for event ${event.event_id}.`,
          );
          return event;
        }
      } catch (error) {
        debug.error(
          `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} beforeErrorSampling callback threw an error, proceeding with replay capture`,
          error,
        );
        // Continue with replay capture if callback throws
      }
    }

    // Read the buffered replay id WITHOUT flushing. The native bridge returns
    // the id assigned when recording started (buffer or full session), so the
    // event can be linked to the replay that will be flushed after sampling.
    const replayId = NATIVE.getCurrentReplayId();
    if (replayId) {
      updateCachedReplayId(replayId);
      // Add replay_id to error event contexts to link replays to events/traces
      event.contexts = event.contexts || {};
      event.contexts.replay = {
        ...event.contexts.replay,
        replay_id: replayId,
      };
      debug.log(
        `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} linked replay ${replayId} to event ${event.event_id}; flush deferred until after sampling.`,
      );
    } else {
      updateCachedReplayId(null);
      debug.log(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} no active recording for event ${event.event_id}.`);
    }

    return event;
  }

  async function flushReplayForSentEvent(event: Event): Promise<void> {
    const eventId = event.event_id;
    // Only flush for events that were linked to a buffered replay in
    // `beforeSend`. The link lives on the event itself, so no shared bookkeeping
    // is needed: events dropped by sampling never reach this hook and cannot
    // affect the flush decision for other events.
    if (!eventId || !event.contexts?.replay?.replay_id) {
      return;
    }

    try {
      const replayId = await NATIVE.captureReplay(isHardCrash(event));
      if (replayId) {
        updateCachedReplayId(replayId);
        debug.log(
          `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} flushed recording replay ${replayId} for sent event ${eventId}.`,
        );
      } else {
        // No replay was uploaded (e.g. an on-error sampling miss). Re-read the
        // current recording id so the cache stops exposing an id that was never
        // uploaded; it resolves to the still-active buffer id, or null.
        updateCachedReplayId(NATIVE.getCurrentReplayId());
        debug.log(
          `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} not sampled for event ${eventId} (replaysOnErrorSampleRate).`,
        );
      }
    } catch (error) {
      debug.error(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} Failed to flush replay for sent event ${eventId}`, error);
    }
  }

  function setup(client: Client): void {
    if (!hasHooks(client)) {
      return;
    }

    if ((options.networkDetailAllowUrls?.length ?? 0) > 0) {
      registerFeatureMarker(MOBILE_REPLAY_NETWORK_DETAILS_INTEGRATION_NAME, client);
      if (options.networkCaptureBodies ?? true) {
        registerFeatureMarker(MOBILE_REPLAY_NETWORK_BODIES_INTEGRATION_NAME, client);
      }
    }

    // Initialize the cached replay ID on setup
    cachedReplayId = NATIVE.getCurrentReplayId();

    client.on('createDsc', (dsc: DynamicSamplingContext) => {
      if (dsc.replay_id) {
        return;
      }

      // Use cached replay ID to avoid bridge calls
      const currentReplayId = getCachedReplayId();
      if (currentReplayId) {
        dsc.replay_id = currentReplayId;
      }
    });

    client.on('processMetric', (metric: Metric) => {
      // Add replay_id to metric attributes to link metrics to replays
      const currentReplayId = getCachedReplayId();
      if (currentReplayId) {
        metric.attributes = metric.attributes || {};
        metric.attributes.replay_id = currentReplayId;
      }
    });

    const networkOptions: ResolvedNetworkOptions = {
      allowUrls: options.networkDetailAllowUrls ?? [],
      denyUrls: options.networkDetailDenyUrls ?? [],
      captureBodies: options.networkCaptureBodies ?? true,
      requestHeaders: options.networkRequestHeaders ?? [],
      responseHeaders: options.networkResponseHeaders ?? [],
    };
    client.on('beforeAddBreadcrumb', makeEnrichXhrBreadcrumbsForMobileReplay(networkOptions));

    // Wrap beforeSend to run processEvent after user's beforeSend
    const clientOptions = client.getOptions();

    // Binary (Blob/ArrayBuffer) response bodies — which is every `fetch`
    // response, since RN's fetch polyfill uses XHR with responseType 'blob' —
    // can only be read asynchronously, while breadcrumbs are forwarded to the
    // native SDKs synchronously and cannot be updated afterwards.
    //
    // The breadcrumb is therefore still returned here, so it lands on the
    // JavaScript scope immediately and error events captured while the read is in
    // flight keep it. Only the sync to native — which is what feeds the Replay
    // network tab — is deferred until the body has been read, and then performed
    // once with the resolved body. The breadcrumb keeps its original timestamp,
    // so the replay places it correctly regardless of the delay.
    if (networkOptions.captureBodies && networkOptions.allowUrls.length > 0) {
      const originalBeforeBreadcrumb = clientOptions.beforeBreadcrumb;
      clientOptions.beforeBreadcrumb = (breadcrumb: Breadcrumb, hint?: BreadcrumbHint): Breadcrumb | null => {
        const result = originalBeforeBreadcrumb ? originalBeforeBreadcrumb(breadcrumb, hint) : breadcrumb;
        if (result === null || !shouldCaptureResponseBodyAsync(result, hint, networkOptions)) {
          return result;
        }

        deferBreadcrumbNativeSync(result);
        const xhr = hint.xhr;
        resolveXhrResponseBody(xhr)
          .then(resolved => {
            syncBreadcrumbToNative(buildResolvedNetworkBreadcrumb(result, hint, resolved, networkOptions));
          })
          .then(undefined, (error: unknown) => {
            debug.error(
              `[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} Failed to sync network breadcrumb with resolved response body to native`,
              error,
            );
          });
        return result;
      };
    }
    const originalBeforeSend = clientOptions.beforeSend;
    clientOptions.beforeSend = async (event: ErrorEvent, hint: EventHint): Promise<ErrorEvent | null> => {
      let result: ErrorEvent | null = event;
      if (originalBeforeSend) {
        result = await originalBeforeSend(event, hint);
        if (result === null) {
          // Event was dropped by user's beforeSend, don't capture replay
          return null;
        }
      }
      try {
        return tagEventWithReplayId(result, hint);
      } catch (error) {
        debug.error(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} Failed to link event to replay`, error);
        return result;
      }
    };

    // Flush the buffered replay only for events that survive sampling. This hook
    // fires after the error `sampleRate` roll in `@sentry/core`, so an error
    // dropped by sampling never triggers a replay upload (issue #6598).
    client.on('afterSendEvent', (event: Event) => {
      flushReplayForSentEvent(event).then(undefined, () => {
        // errors are logged inside flushReplayForSentEvent
      });
    });
  }

  function getReplayId(): string | null {
    return getCachedReplayId();
  }

  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    setup,
    options: options,
    getReplayId: getReplayId,
    start: () => fireReplayControl(NATIVE.startReplay().then(invalidateCachedReplayId), 'start'),
    startBuffering: () =>
      fireReplayControl(NATIVE.startReplayBuffering().then(invalidateCachedReplayId), 'startBuffering'),
    stop: () => NATIVE.stopReplay().then(invalidateCachedReplayId),
    pause: () => fireReplayControl(NATIVE.pauseReplay(), 'pause'),
    resume: () => fireReplayControl(NATIVE.resumeReplay(), 'resume'),
    flush: (options?: { continueRecording?: boolean }) => {
      // The native `flushReplay()` always keeps recording after the flush (a
      // buffered replay is converted to a session and continues), which matches
      // the web default of `continueRecording: true`. When the caller opts out,
      // stop the replay once the flush has completed.
      const flushed = NATIVE.flushReplay();
      const settled = options?.continueRecording === false ? flushed.then(() => NATIVE.stopReplay()) : flushed;
      return settled.then(invalidateCachedReplayId);
    },
  };
};

/**
 * Runs a fire-and-forget replay control (`start`/`startBuffering`/`pause`/
 * `resume`) whose public signature is synchronous (`void`) to match the web
 * Replay API. The underlying native call is async, so we swallow and log any
 * rejection here to avoid an unhandled promise rejection.
 */
function fireReplayControl(promise: Promise<void>, method: string): void {
  promise.then(undefined, (error: unknown) => {
    debug.error(`[Sentry] ${MOBILE_REPLAY_INTEGRATION_NAME} Failed to ${method} replay`, error);
  });
}

const mobileReplayIntegrationNoop = (): MobileReplayIntegration => {
  return {
    name: MOBILE_REPLAY_INTEGRATION_NAME,
    options: defaultOptions,
    getReplayId: () => null, // Mock implementation for noop version
    start: () => {},
    startBuffering: () => {},
    stop: () => Promise.resolve(),
    pause: () => {},
    resume: () => {},
    flush: () => Promise.resolve(),
  };
};
