import type { Integration } from '@sentry/core';

import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps } from './FeedbackForm.types';

export const FEEDBACK_FORM_INTEGRATION_NAME = 'Feedback Form';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackFormProps>;
};

let savedOptions: Partial<FeedbackFormProps> = {};

export const feedbackIntegration = (initOptions: FeedbackFormProps = {}): FeedbackIntegration => {
  savedOptions = {
    ...defaultConfiguration,
    ...initOptions,
    styles: {
      ...defaultStyles,
      ...initOptions.styles,
    },
  };

  return {
    name: FEEDBACK_FORM_INTEGRATION_NAME,
    options: savedOptions,
  };
};

export const getFeedbackOptions = (): Partial<FeedbackFormProps> => savedOptions;
