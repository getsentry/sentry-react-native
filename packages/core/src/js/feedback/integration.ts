import { type Integration, getClient } from '@sentry/core';

import type { FeedbackWidgetTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonProps, FeedbackWidgetProps } from './FeedbackWidget.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
  colorScheme?: 'system' | 'light' | 'dark';
  themeLight: Partial<FeedbackWidgetTheme>;
  themeDark: Partial<FeedbackWidgetTheme>;
};

export const feedbackIntegration = (
  initOptions: FeedbackWidgetProps & {
    buttonOptions?: FeedbackButtonProps;
    colorScheme?: 'system' | 'light' | 'dark';
    themeLight?: Partial<FeedbackWidgetTheme>;
    themeDark?: Partial<FeedbackWidgetTheme>;
  } = {},
): FeedbackIntegration => {
  const { buttonOptions, colorScheme, themeLight: lightTheme, themeDark: darkTheme, ...widgetOptions } = initOptions;

  return {
    name: MOBILE_FEEDBACK_INTEGRATION_NAME,
    options: widgetOptions,
    buttonOptions: buttonOptions || {},
    colorScheme: colorScheme || 'system',
    themeLight: lightTheme || {},
    themeDark: darkTheme || {},
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

export const getColorScheme = (): 'system' | 'light' | 'dark' => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return 'system';
  }

  return integration.colorScheme;
};

export const getFeedbackLightTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.themeLight;
};

export const getFeedbackDarkTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(
    MOBILE_FEEDBACK_INTEGRATION_NAME,
  );
  if (!integration) {
    return {};
  }

  return integration.themeDark;
};
