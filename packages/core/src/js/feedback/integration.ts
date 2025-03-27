import { type Integration, getClient } from '@sentry/core';

import type { FeedbackButtonProps, FeedbackWidgetProps } from './FeedbackWidget.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
};

export const feedbackIntegration = (
  initOptions: FeedbackWidgetProps & { buttonOptions?: FeedbackButtonProps } = {},
): FeedbackIntegration => {
  const { buttonOptions, ...widgetOptions } = initOptions;

  return {
    name: MOBILE_FEEDBACK_INTEGRATION_NAME,
    options: widgetOptions,
    buttonOptions: buttonOptions || {},
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

export const getFeedbackButtonOptions = (): Partial<FeedbackButtonProps> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.buttonOptions;
};
