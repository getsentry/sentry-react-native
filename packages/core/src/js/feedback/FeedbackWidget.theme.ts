import { Appearance } from 'react-native';

/**
 *
 */
export function getTheme(): FeedbackWidgetTheme {
  const colorScheme = Appearance.getColorScheme();
  return colorScheme === 'dark' ? DarkTheme : LightTheme;
}
export interface FeedbackWidgetTheme {
  BRANDING: string;
  BACKGROUND_COLOR: string;
  FOREGROUND_COLOR: string;
  BORDER_COLOR: string;
  FEEDBACK_ICON_COLOR?: string;
  SENTRY_LOGO_COLOR?: string;
}

export const LightTheme: FeedbackWidgetTheme = {
  BRANDING: 'rgba(88, 74, 192, 1)',
  FOREGROUND_COLOR: '#2b2233',
  BACKGROUND_COLOR: '#ffffff',
  BORDER_COLOR: 'rgba(41, 35, 47, 0.13)',
  FEEDBACK_ICON_COLOR: 'rgba(54, 45, 89, 1)',
  SENTRY_LOGO_COLOR: 'rgba(54, 45, 89, 1)',
};

export const DarkTheme: FeedbackWidgetTheme = {
  BRANDING: 'rgba(88, 74, 192, 1)',
  FOREGROUND_COLOR: '#ebe6ef',
  BACKGROUND_COLOR: '#29232f',
  BORDER_COLOR: 'rgba(235, 230, 239, 0.15)',
  FEEDBACK_ICON_COLOR: '#ffffff',
  SENTRY_LOGO_COLOR: '#ffffff',
};
