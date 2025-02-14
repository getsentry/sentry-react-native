import type { Integration } from '@sentry/core';

import type { FeedbackWidgetProps } from './FeedbackWidget.types';

export const FEEDBACK_FORM_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
};

let savedOptions: Partial<FeedbackWidgetProps> = {};

export const feedbackIntegration = (initOptions: FeedbackWidgetProps = {}): FeedbackIntegration => {
  savedOptions = initOptions;

  return {
    name: FEEDBACK_FORM_INTEGRATION_NAME,
    options: savedOptions,
  };
};

export const getFeedbackOptions = (): Partial<FeedbackWidgetProps> => savedOptions;
