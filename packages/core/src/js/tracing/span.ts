import type { Client, Scope, Span, SpanJSON, StartSpanOptions } from '@sentry/core';

import {
  _INTERNAL_setSpanForScope,
  debug,
  generateTraceId,
  getActiveSpan,
  getClient,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  SPAN_STATUS_ERROR,
  spanToStaticSpanJSON,
} from '@sentry/core';
// `startIdleSpan` moved from the `@sentry/core` root entry to its `browser`
// subpath in JS v11 (the entry point was split into shared/browser/server).
import { startIdleSpan as coreStartIdleSpan } from '@sentry/core/browser';
import { AppState, Platform } from 'react-native';

import { isRootSpan } from '../utils/span';
import { adjustTransactionDuration, cancelInBackground } from './onSpanEndUtils';
import {
  SPAN_ORIGIN_AUTO_INTERACTION,
  SPAN_ORIGIN_AUTO_NAVIGATION_CUSTOM,
  SPAN_ORIGIN_MANUAL_INTERACTION,
} from './origin';

export const DEFAULT_NAVIGATION_SPAN_NAME = 'Route Change';

export const defaultIdleOptions: {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   *
   * @default 1_000 (ms)
   */
  idleTimeout: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * @default 600_000 (ms)
   */
  finalTimeout: number;
} = {
  idleTimeout: 1_000,
  finalTimeout: 600_000,
};

export const startIdleNavigationSpan = (
  startSpanOption: StartSpanOptions,
  {
    finalTimeout = defaultIdleOptions.finalTimeout,
    idleTimeout = defaultIdleOptions.idleTimeout,
    isAppRestart = false,
  }: Partial<typeof defaultIdleOptions> & { isAppRestart?: boolean } = {},
): Span | undefined => {
  const client = getClient();
  if (!client) {
    debug.warn("[startIdleNavigationSpan] Can't create route change span, missing client.");
    return undefined;
  }

  const activeSpan = getActiveSpan();
  const isActiveSpanInteraction = activeSpan && isRootSpan(activeSpan) && isSentryInteractionSpan(activeSpan);

  clearActiveSpanFromScope(getCurrentScope());

  // Don't cancel user interaction spans when starting from runApplication (app restart/reload).
  // This preserves the span context for error capture and replay recording.
  if (isActiveSpanInteraction && isAppRestart) {
    debug.log(
      `[startIdleNavigationSpan] Not canceling ${
        spanToStaticSpanJSON(activeSpan).op
      } transaction because navigation is from app restart - preserving error context.`,
    );
    // Don't end the span - it will timeout naturally and remains available for error/replay processing
  } else if (isActiveSpanInteraction) {
    debug.log(
      `[startIdleNavigationSpan] Canceling ${
        spanToStaticSpanJSON(activeSpan).op
      } transaction because of a new navigation root span.`,
    );
    activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    activeSpan.end();
  }

  const finalStartSpanOptions = {
    ...getDefaultIdleNavigationSpanOptions(),
    ...startSpanOption,
  };

  const idleSpan = startIdleSpan(finalStartSpanOptions, { finalTimeout, idleTimeout });
  debug.log(
    `[startIdleNavigationSpan] Starting ${finalStartSpanOptions.op || 'unknown op'} transaction "${
      finalStartSpanOptions.name
    }" on scope`,
  );

  adjustTransactionDuration(client, idleSpan, finalTimeout);

  idleSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_NAVIGATION_CUSTOM);
  return idleSpan;
};

/**
 * Starts an idle span from `@sentry/core` with React Native application
 * context awareness.
 *
 * - Span will be started with new propagation context.
 * - Span will be canceled if the app goes to background.
 */
export const startIdleSpan = (
  startSpanOption: StartSpanOptions,
  { finalTimeout, idleTimeout }: { finalTimeout: number | undefined; idleTimeout: number | undefined },
): Span => {
  const client = getClient();
  if (!client) {
    debug.warn("[startIdleSpan] Can't create idle span, missing client.");
    return new SentryNonRecordingSpan();
  }

  const currentAppState = AppState.currentState;
  if (currentAppState === 'background' || (Platform.OS === 'ios' && currentAppState === 'inactive')) {
    debug.log(
      `[startIdleSpan] App is already in '${currentAppState}' state, not starting span for ${startSpanOption.name}`,
    );
    return new SentryNonRecordingSpan();
  }

  getCurrentScope().setPropagationContext({ traceId: generateTraceId(), sampleRand: Math.random() });

  const span = coreStartIdleSpan(startSpanOption, { finalTimeout, idleTimeout });
  cancelInBackground(client, span);
  return span;
};

/**
 * Returns the default options for the idle navigation span.
 */
export function getDefaultIdleNavigationSpanOptions(): StartSpanOptions {
  return {
    name: DEFAULT_NAVIGATION_SPAN_NAME,
    op: 'navigation',
    forceTransaction: true,
    scope: getCurrentScope(),
  };
}

/**
 * Checks if the span is a Sentry User Interaction span.
 */
export function isSentryInteractionSpan(span: Span): boolean {
  return [SPAN_ORIGIN_AUTO_INTERACTION, SPAN_ORIGIN_MANUAL_INTERACTION].includes(
    spanToStaticSpanJSON(span).origin || '',
  );
}

/**
 * Removes the active span from the scope.
 *
 * JS v11 no longer stores the active span on a `_sentrySpan` scope property; it
 * keeps a `WeakRef` under `scope.refs.span`. Deleting the old field is a no-op,
 * so we must clear via the official helper — otherwise the previous span stays
 * active and becomes the parent of the next root (navigation/interaction) span.
 */
export function clearActiveSpanFromScope(scope: Scope): void {
  _INTERNAL_setSpanForScope(scope, undefined);
}

/**
 * Ensures that all created spans have an operation name.
 */
export function addDefaultOpForSpanFrom(client: Client): void {
  client.on('spanStart', (span: Span) => {
    if (!spanToStaticSpanJSON(span).op) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'default');
    }
  });
}

export const SPAN_THREAD_NAME = 'thread.name';
export const SPAN_THREAD_NAME_MAIN = 'main';
export const SPAN_THREAD_NAME_JAVASCRIPT = 'javascript';

/**
 * Adds Javascript thread info to spans.
 * Ref: https://reactnative.dev/architecture/threading-model
 */
export function addThreadInfoToSpan(client: Client): void {
  client.on('spanStart', (span: Span) => {
    if (!spanToStaticSpanJSON(span).data?.[SPAN_THREAD_NAME]) {
      span.setAttribute(SPAN_THREAD_NAME, SPAN_THREAD_NAME_JAVASCRIPT);
    }
  });
}

/**
 * Sets the Main thread info to the span.
 */
export function setMainThreadInfo(spanJSON: SpanJSON): SpanJSON {
  spanJSON.data = spanJSON.data || {};
  spanJSON.data[SPAN_THREAD_NAME] = SPAN_THREAD_NAME_MAIN;
  return spanJSON;
}
