import { type Integration, getClient } from '@sentry/core';

import type { FeedbackWidgetTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonProps, FeedbackWidgetProps, ScreenshotButtonProps } from './FeedbackWidget.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackWidgetProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
  screenshotButtonOptions: Partial<ScreenshotButtonProps>;
  colorScheme?: 'system' | 'light' | 'dark';
  themeLight: Partial<FeedbackWidgetTheme>;
  themeDark: Partial<FeedbackWidgetTheme>;
};

export const feedbackIntegration = (
  initOptions: FeedbackWidgetProps & {
    buttonOptions?: FeedbackButtonProps;
    screenshotButtonOptions?: ScreenshotButtonProps;
    colorScheme?: 'system' | 'light' | 'dark';
    themeLight?: Partial<FeedbackWidgetTheme>;
    themeDark?: Partial<FeedbackWidgetTheme>;
  } = {},
): FeedbackIntegration => {
  const {
    buttonOptions,
    screenshotButtonOptions,
    colorScheme,
    themeLight: lightTheme,
    themeDark: darkTheme,
    ...widgetOptions
  } = initOptions;

  return {
    name: MOBILE_FEEDBACK_INTEGRATION_NAME,
    options: widgetOptions,
    buttonOptions: buttonOptions || {},
    screenshotButtonOptions: screenshotButtonOptions || {},
    colorScheme: colorScheme || 'system',
    themeLight: lightTheme || {},
    themeDark: darkTheme || {},
  };
};

const _getClientIntegration = (): FeedbackIntegration => {
  return getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(MOBILE_FEEDBACK_INTEGRATION_NAME);
};

export const getFeedbackOptions = (): Partial<FeedbackWidgetProps> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.options;
};

export const getFeedbackButtonOptions = (): Partial<FeedbackButtonProps> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.buttonOptions;
};

export const getScreenshotButtonOptions = (): Partial<ScreenshotButtonProps> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.screenshotButtonOptions;
};

export const getColorScheme = (): 'system' | 'light' | 'dark' => {
  const integration = _getClientIntegration();
  if (!integration) {
    return 'system';
  }

  return integration.colorScheme;
};

export const getFeedbackLightTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.themeLight;
};

export const getFeedbackDarkTheme = (): Partial<FeedbackWidgetTheme> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.themeDark;
};
