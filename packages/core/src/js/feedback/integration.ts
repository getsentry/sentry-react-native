import type { Integration } from '@sentry/core';

import type { FeedbackFormProps } from './FeedbackForm.types';

export const FEEDBACK_FORM_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackFormProps>;
};

let savedOptions: Partial<FeedbackFormProps> = {};

export const feedbackIntegration = (initOptions: FeedbackFormProps = {}): FeedbackIntegration => {
  savedOptions = initOptions;

  return {
    name: FEEDBACK_FORM_INTEGRATION_NAME,
    options: savedOptions,
  };
};

export const getFeedbackOptions = (): Partial<FeedbackFormProps> => savedOptions;
