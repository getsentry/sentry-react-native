import { type Integration, getClient } from '@sentry/core';
import type { FeedbackWidgetProps } from './FeedbackWidget.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
};

export const feedbackIntegration = (initOptions: Partial<FeedbackWidgetProps> = {}): FeedbackIntegration => {
  return {
    name: MOBILE_FEEDBACK_INTEGRATION_NAME,
    options: initOptions,
  };
};

export const getFeedbackOptions = (): Partial<FeedbackWidgetProps> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.options;
};
