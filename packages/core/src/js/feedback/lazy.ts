import { getClient } from '@sentry/core';
import { feedbackIntegration, MOBILE_FEEDBACK_INTEGRATION_NAME } from './integration';

/**
 * Lazy loads the feedback integration if it is not already loaded.
 */
export function lazyLoadFeedbackIntegration(): void {
  const integration = getClient()?.getIntegrationByName(MOBILE_FEEDBACK_INTEGRATION_NAME);
  if (!integration) {
    // Lazy load the integration to track usage
    getClient()?.addIntegration(feedbackIntegration());
  }
}

export const AUTO_INJECT_FEEDBACK_INTEGRATION_NAME = 'AutoInjectMobileFeedback';

/**
 * Lazy loads the auto inject feedback integration if it is not already loaded.
 */
export function lazyLoadAutoInjectFeedbackIntegration(): void {
  const integration = getClient()?.getIntegrationByName(AUTO_INJECT_FEEDBACK_INTEGRATION_NAME);
  if (!integration) {
    // Lazy load the integration to track usage
    getClient()?.addIntegration({ name: AUTO_INJECT_FEEDBACK_INTEGRATION_NAME });
  }
}
