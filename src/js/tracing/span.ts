import {
  getActiveSpan,
  getClient,
  getCurrentScope,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SentryNonRecordingSpan,
  SPAN_STATUS_ERROR,
  spanToJSON,
  startIdleSpan as coreStartIdleSpan,
} from '@sentry/core';
import type { Client, Scope, Span, StartSpanOptions } from '@sentry/types';
import { generatePropagationContext, logger } from '@sentry/utils';

import { isRootSpan } from '../utils/span';
import { adjustTransactionDuration, cancelInBackground, ignoreEmptyBackNavigation } from './onSpanEndUtils';
import { SPAN_ORIGIN_AUTO_INTERACTION } from './origin';

export const startIdleNavigationSpan = (
  startSpanOption: StartSpanOptions,
  {
    finalTimeout,
    idleTimeout,
    ignoreEmptyBackNavigationTransactions,
  }: {
    finalTimeout: number;
    idleTimeout: number;
    ignoreEmptyBackNavigationTransactions: boolean;
  },
): Span | undefined => {
  const client = getClient();
  if (!client) {
    logger.warn(`[ReactNativeTracing] Can't create route change span, missing client.`);
    return undefined;
  }

  const activeSpan = getActiveSpan();
  if (activeSpan && isRootSpan(activeSpan) && isSentryInteractionSpan(activeSpan)) {
    logger.log(
      `[ReactNativeTracing] Canceling ${spanToJSON(activeSpan).op} transaction because of a new navigation root span.`,
    );
    activeSpan.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    activeSpan.end();
  }

  const idleSpan = startIdleSpan(startSpanOption, { finalTimeout, idleTimeout });
  logger.log(
    `[ReactNativeTracing] Starting ${startSpanOption.op || 'unknown op'} transaction "${
      startSpanOption.name
    }" on scope`,
  );

  adjustTransactionDuration(client, idleSpan, finalTimeout);
  if (ignoreEmptyBackNavigationTransactions) {
    ignoreEmptyBackNavigation(client, idleSpan);
  }

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
    logger.warn(`[ReactNativeTracing] Can't create idle span, missing client.`);
    return new SentryNonRecordingSpan();
  }

  getCurrentScope().setPropagationContext(generatePropagationContext());

  const span = coreStartIdleSpan(startSpanOption, { finalTimeout, idleTimeout });
  cancelInBackground(client, span);
  return span;
};

/**
 * Checks if the span is a Sentry User Interaction span.
 */
export function isSentryInteractionSpan(span: Span): boolean {
  return spanToJSON(span).origin === SPAN_ORIGIN_AUTO_INTERACTION;
}

const SCOPE_SPAN_FIELD = '_sentrySpan';

type ScopeWithMaybeSpan = Scope & {
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
