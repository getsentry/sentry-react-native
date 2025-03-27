import { Appearance } from 'react-native';

import { getColorScheme, getFeedbackDarkTheme, getFeedbackLightTheme } from './integration';

/**
 * Get the theme for the feedback widget based on the current color scheme
 */
export function getTheme(): FeedbackWidgetTheme {
  const userTheme = getColorScheme();
  const colorScheme = userTheme === 'system' ? Appearance.getColorScheme() : userTheme;
  const lightTheme = { ...LightTheme, ...getFeedbackLightTheme() };
  const darkTheme = { ...DarkTheme, ...getFeedbackDarkTheme() };
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export interface FeedbackWidgetTheme {
  /**
   * Background color for surfaces
   */
  background: string;

  /**
   * Foreground color (i.e. text color)
   */
  foreground: string;

  /**
   * Foreground color for accented elements
   */
  accentForeground?: string;

  /**
   * Background color for accented elements
   */
  accentBackground?: string;

  /**
   * Border color
   */
  border?: string;

  /**
   * Color for feedback icon
   */
  feedbackIcon?: string;

  /**
   * Color for Sentry logo
   */
  sentryLogo?: string;
}

export const LightTheme: FeedbackWidgetTheme = {
  accentBackground: 'rgba(88, 74, 192, 1)',
  accentForeground: '#ffffff',
  foreground: '#2b2233',
  background: '#ffffff',
  border: 'rgba(41, 35, 47, 0.13)',
  feedbackIcon: 'rgba(54, 45, 89, 1)',
  sentryLogo: 'rgba(54, 45, 89, 1)',
};

export const DarkTheme: FeedbackWidgetTheme = {
  accentBackground: 'rgba(88, 74, 192, 1)',
  accentForeground: '#ffffff',
  foreground: '#ebe6ef',
  background: '#29232f',
  border: 'rgba(235, 230, 239, 0.15)',
  feedbackIcon: '#ffffff',
  sentryLogo: '#ffffff',
};
