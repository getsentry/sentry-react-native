import { type Integration, getClient } from '@sentry/core';

import type { FeedbackWidgetTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonProps, FeedbackWidgetProps } from './FeedbackWidget.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
  lightTheme: Partial<FeedbackWidgetTheme>;
  darkTheme: Partial<FeedbackWidgetTheme>;
};

export const feedbackIntegration = (
  initOptions: FeedbackWidgetProps & {
    buttonOptions?: FeedbackButtonProps;
    lightTheme?: Partial<FeedbackWidgetTheme>;
    darkTheme?: Partial<FeedbackWidgetTheme>;
  } = {},
): FeedbackIntegration => {
  const { buttonOptions, lightTheme, darkTheme, ...widgetOptions } = initOptions;

  return {
    name: MOBILE_FEEDBACK_INTEGRATION_NAME,
    options: widgetOptions,
    buttonOptions: buttonOptions || {},
    lightTheme: lightTheme || {},
    darkTheme: darkTheme || {},
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

export const getFeedbackLightTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.lightTheme;
};

export const getFeedbackDarkTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.darkTheme;
};
