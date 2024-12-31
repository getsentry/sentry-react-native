import type { Integration, Span, StartSpanOptions } from '@sentry/core';
import {
  getActiveSpan,
  getClient,
  getCurrentScope,
  logger,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  spanToJSON,
} from '@sentry/core';

import type { ReactNativeClientOptions } from '../../options';
import { onlySampleIfChildSpans } from '../onSpanEndUtils';
import { SPAN_ORIGIN_MANUAL_INTERACTION } from '../origin';
import { getCurrentReactNativeTracingIntegration } from '../reactnativetracing';
import { clearActiveSpanFromScope, isSentryInteractionSpan, startIdleSpan } from '../span';

const INTEGRATION_NAME = 'UserInteraction';

export const userInteractionIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
  };
};

/**
 * Starts a new transaction for a user interaction.
 * @param userInteractionId Consists of `op` representation UI Event and `elementId` unique element identifier on current screen.
 */
export const startUserInteractionSpan = (userInteractionId: {
  elementId: string | undefined;
  op: string;
}): Span | undefined => {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  const tracing = getCurrentReactNativeTracingIntegration();
  if (!tracing) {
    logger.log(`[${INTEGRATION_NAME}] Tracing integration is not available. Can not start user interaction span.`);
    return undefined;
  }

  const options = client.getOptions() as ReactNativeClientOptions;
  const { elementId, op } = userInteractionId;
  if (!options.enableUserInteractionTracing) {
    logger.log(`[${INTEGRATION_NAME}] User Interaction Tracing is disabled.`);
    return undefined;
  }
  if (!elementId) {
    logger.log(`[${INTEGRATION_NAME}] User Interaction Tracing can not create transaction with undefined elementId.`);
    return undefined;
  }
  if (!tracing.state.currentRoute) {
    logger.log(`[${INTEGRATION_NAME}] User Interaction Tracing can not create transaction without a current route.`);
    return undefined;
  }

  const activeTransaction = getActiveSpan();
  const activeTransactionIsNotInteraction = activeTransaction && !isSentryInteractionSpan(activeTransaction);
  if (activeTransaction && activeTransactionIsNotInteraction) {
    logger.warn(
      `[${INTEGRATION_NAME}] Did not create ${op} transaction because active transaction ${
        spanToJSON(activeTransaction).description
      } exists on the scope.`,
    );
    return undefined;
  }

  const name = `${tracing.state.currentRoute}.${elementId}`;
  if (
    activeTransaction &&
    spanToJSON(activeTransaction).description === name &&
    spanToJSON(activeTransaction).op === op
  ) {
    logger.warn(
      `[${INTEGRATION_NAME}] Did not create ${op} transaction because it the same transaction ${
        spanToJSON(activeTransaction).description
      } already exists on the scope.`,
    );
    return undefined;
  }

  const scope = getCurrentScope();
  const context: StartSpanOptions = {
    name,
    op,
    scope,
  };
  clearActiveSpanFromScope(scope);
  const newSpan = startIdleSpan(context, {
    idleTimeout: tracing.options.idleTimeoutMs,
    finalTimeout: tracing.options.finalTimeoutMs,
  });
  newSpan.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_MANUAL_INTERACTION);
  onlySampleIfChildSpans(client, newSpan);
  logger.log(`[${INTEGRATION_NAME}] User Interaction Tracing Created ${op} transaction ${name}.`);
  return newSpan;
};
