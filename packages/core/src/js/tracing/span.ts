import type { Client, Scope, Span, SpanJSON, StartSpanOptions } from '@sentry/core';
import {
  generatePropagationContext,
  getActiveSpan,
  getClient,
  getCurrentScope,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SentryNonRecordingSpan,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startIdleSpan as coreStartIdleSpan,
} from '@sentry/core';

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
  finalTimeout: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * @default 60_0000 (ms)
   */
  idleTimeout: number;
} = {
  idleTimeout: 1_000,
  finalTimeout: 60_0000,
};

export const startIdleNavigationSpan = (
  startSpanOption: StartSpanOptions,
  {
    finalTimeout = defaultIdleOptions.finalTimeout,
    idleTimeout = defaultIdleOptions.idleTimeout,
  }: Partial<typeof defaultIdleOptions> = {},
): Span | undefined => {
  const client = getClient();
  if (!client) {
    logger.warn(`[startIdleNavigationSpan] Can't create route change span, missing client.`);
    return undefined;
  }

  const activeSpan = getActiveSpan();
  clearActiveSpanFromScope(getCurrentScope());
  if (activeSpan && isRootSpan(activeSpan) && isSentryInteractionSpan(activeSpan)) {
    logger.log(
      `[startIdleNavigationSpan] Canceling ${
        spanToJSON(activeSpan).op
      } transaction because of a new navigation root span.`,
    );
    activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    activeSpan.end();
  }

  const finalStartStapOptions = {
    ...getDefaultIdleNavigationSpanOptions(),
    ...startSpanOption,
  };

  const idleSpan = startIdleSpan(finalStartStapOptions, { finalTimeout, idleTimeout });
  logger.log(
    `[startIdleNavigationSpan] Starting ${finalStartStapOptions.op || 'unknown op'} transaction "${
      finalStartStapOptions.name
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
    logger.warn(`[startIdleSpan] Can't create idle span, missing client.`);
    return new SentryNonRecordingSpan();
  }

  getCurrentScope().setPropagationContext(generatePropagationContext());

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
  return [SPAN_ORIGIN_AUTO_INTERACTION, SPAN_ORIGIN_MANUAL_INTERACTION].includes(spanToJSON(span).origin);
}

export const SCOPE_SPAN_FIELD = '_sentrySpan';

export type ScopeWithMaybeSpan = Scope & {
  [SCOPE_SPAN_FIELD]?: Span;
};

/**
 * Removes the active span from the scope.
 */
export function clearActiveSpanFromScope(scope: ScopeWithMaybeSpan): void {
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete scope[SCOPE_SPAN_FIELD];
}

/**
 * Ensures that all created spans have an operation name.
 */
export function addDefaultOpForSpanFrom(client: Client): void {
  client.on('spanStart', (span: Span) => {
    if (!spanToJSON(span).op) {
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
    if (!spanToJSON(span).data?.[SPAN_THREAD_NAME]) {
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
