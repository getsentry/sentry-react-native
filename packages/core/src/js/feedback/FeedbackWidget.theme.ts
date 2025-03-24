import { Appearance } from 'react-native';

import { getFeedbackDarkTheme, getFeedbackLightTheme } from './integration';

/**
 * Get the theme for the feedback widget based on the current color scheme
 */
export function getTheme(): FeedbackWidgetTheme {
  const colorScheme = Appearance.getColorScheme();
  const lightTheme = { ...LightTheme, ...getFeedbackLightTheme() };
  const darkTheme = { ...DarkTheme, ...getFeedbackDarkTheme() };
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}

export interface FeedbackWidgetTheme {
  branding: string;
  background: string;
  foreground: string;
  border: string;
  feedbackIcon?: string;
  sentryLogo?: string;
}

export const LightTheme: FeedbackWidgetTheme = {
  branding: 'rgba(88, 74, 192, 1)',
  foreground: '#2b2233',
  background: '#ffffff',
  border: 'rgba(41, 35, 47, 0.13)',
  feedbackIcon: 'rgba(54, 45, 89, 1)',
  sentryLogo: 'rgba(54, 45, 89, 1)',
};

export const DarkTheme: FeedbackWidgetTheme = {
  branding: 'rgba(88, 74, 192, 1)',
  foreground: '#ebe6ef',
  background: '#29232f',
  border: 'rgba(235, 230, 239, 0.15)',
  feedbackIcon: '#ffffff',
  sentryLogo: '#ffffff',
};
