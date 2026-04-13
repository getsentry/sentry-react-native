import { getClient, type Integration } from '@sentry/core';

import type { FeedbackFormTheme } from './FeedbackForm.theme';
import type { FeedbackButtonProps, FeedbackFormProps, ScreenshotButtonProps } from './FeedbackForm.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackFormProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
  screenshotButtonOptions: Partial<ScreenshotButtonProps>;
  colorScheme?: 'system' | 'light' | 'dark';
  themeLight: Partial<FeedbackFormTheme>;
  themeDark: Partial<FeedbackFormTheme>;
  enableShakeToReport: boolean;
};

export const feedbackIntegration = (
  initOptions: Partial<FeedbackFormProps> & {
    buttonOptions?: FeedbackButtonProps;
    screenshotButtonOptions?: ScreenshotButtonProps;
    colorScheme?: 'system' | 'light' | 'dark';
    themeLight?: Partial<FeedbackFormTheme>;
    themeDark?: Partial<FeedbackFormTheme>;
    /**
     * Enable showing the feedback widget when the user shakes the device.
     *
     * - iOS: Uses UIKit's motion event detection (no permissions required)
     * - Android: Uses the accelerometer sensor (no permissions required)
     *
     * @default false
     */
    enableShakeToReport?: boolean;
  } = {},
): FeedbackIntegration => {
  const {
    buttonOptions,
    screenshotButtonOptions,
    colorScheme,
    themeLight: lightTheme,
    themeDark: darkTheme,
    enableShakeToReport: shakeToReport,
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
    enableShakeToReport: shakeToReport || false,
  };
};

const _getClientIntegration = (): FeedbackIntegration | undefined => {
  return getClient()?.getIntegrationByName<ReturnType<typeof feedbackIntegration>>(MOBILE_FEEDBACK_INTEGRATION_NAME);
};

export const getFeedbackOptions = (): Partial<FeedbackFormProps> => {
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
  if (!integration?.colorScheme) {
    return 'system';
  }

  return integration.colorScheme;
};

export const getFeedbackLightTheme = (): Partial<FeedbackFormTheme> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.themeLight;
};

export const getFeedbackDarkTheme = (): Partial<FeedbackFormTheme> => {
  const integration = _getClientIntegration();
  if (!integration) {
    return {};
  }

  return integration.themeDark;
};

export const isShakeToReportEnabled = (): boolean => {
  const integration = _getClientIntegration();
  return integration?.enableShakeToReport ?? false;
};
