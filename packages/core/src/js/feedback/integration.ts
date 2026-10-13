import { getClient, type Integration } from '@sentry/core';

import type { FeedbackFormTheme } from './FeedbackForm.theme';
import type { FeedbackButtonProps, FeedbackFormProps, ScreenshotButtonProps } from './FeedbackForm.types';

export const MOBILE_FEEDBACK_INTEGRATION_NAME = 'MobileFeedback';

/**
 * Experimental feedback options. These are unstable and may change or be
 * removed without a major version bump, and some may become the default.
 */
export type FeedbackExperiments = {
  /**
   * iOS only. Render the feedback form inside react-native-screens'
   * `FullWindowOverlay` instead of a React Native `Modal`, so it can appear
   * above a presented native-stack sheet/modal (e.g. `presentation: 'formSheet'`).
   *
   * Requires `react-native-screens`; no-ops (falls back to `Modal`) when it is
   * not installed.
   *
   * Known limitation: because the form is drawn in a window-level overlay, the
   * screenshot attachment flows are limited over a presented native-stack sheet.
   * The photo-library picker ("Add a screenshot", via `imagePicker`) is presented
   * behind the overlay, and "Take a screenshot" reveals its capture button in the
   * root view tree behind the sheet — both unreachable while the sheet is up.
   * Alerts and text entry are unaffected.
   *
   * @default false
   */
  presentOverNativeModals?: boolean;
};

type FeedbackIntegration = Integration & {
  options: Partial<FeedbackFormProps>;
  buttonOptions: Partial<FeedbackButtonProps>;
  screenshotButtonOptions: Partial<ScreenshotButtonProps>;
  colorScheme?: 'system' | 'light' | 'dark';
  themeLight: Partial<FeedbackFormTheme>;
  themeDark: Partial<FeedbackFormTheme>;
  enableShakeToReport: boolean;
  experiments: FeedbackExperiments;
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
    /**
     * Experimental feedback options. Unstable — may change or be removed without
     * a major version bump.
     */
    _experiments?: FeedbackExperiments;
  } = {},
): FeedbackIntegration => {
  const {
    buttonOptions,
    screenshotButtonOptions,
    colorScheme,
    themeLight: lightTheme,
    themeDark: darkTheme,
    enableShakeToReport: shakeToReport,
    _experiments: experiments,
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
    experiments: experiments || {},
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

export const isPresentOverNativeModalsEnabled = (): boolean => {
  const integration = _getClientIntegration();
  return integration?.experiments.presentOverNativeModals ?? false;
};
