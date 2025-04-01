import type { ViewStyle } from 'react-native';

import type { FeedbackWidgetTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonStyles, FeedbackWidgetStyles } from './FeedbackWidget.types';

const defaultStyles = (theme: FeedbackWidgetTheme): FeedbackWidgetStyles => {
  return {
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: theme.background,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'left',
      flex: 1,
      color: theme.foreground,
    },
    label: {
      marginBottom: 4,
      fontSize: 16,
      color: theme.foreground,
    },
    input: {
      height: 50,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 10,
      marginBottom: 15,
      fontSize: 16,
      color: theme.foreground,
    },
    textArea: {
      height: 100,
      textAlignVertical: 'top',
      color: theme.foreground,
    },
    screenshotButton: {
      backgroundColor: theme.background,
      padding: 15,
      borderRadius: 5,
      alignItems: 'center',
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
    },
    screenshotContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginBottom: 20,
    },
    screenshotThumbnail: {
      width: 50,
      height: 50,
      borderRadius: 5,
      marginRight: 10,
    },
    screenshotText: {
      color: theme.foreground,
      fontSize: 16,
    },
    takeScreenshotButton: {
      backgroundColor: theme.background,
      padding: 15,
      borderRadius: 5,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginTop: -10,
      marginBottom: 20,
    },
    takeScreenshotText: {
      color: theme.foreground,
      fontSize: 16,
    },
    submitButton: {
      backgroundColor: theme.accentBackground,
      paddingVertical: 15,
      borderRadius: 5,
      alignItems: 'center',
      marginBottom: 10,
    },
    submitText: {
      color: theme.accentForeground,
      fontSize: 18,
    },
    cancelButton: {
      backgroundColor: theme.background,
      padding: 15,
      borderRadius: 5,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelText: {
      color: theme.foreground,
      fontSize: 16,
    },
    titleContainer: {
      flexDirection: 'row',
      width: '100%',
    },
    sentryLogo: {
      width: 40,
      height: 40,
      tintColor: theme.sentryLogo,
    },
  };
};

export const defaultButtonStyles = (theme: FeedbackWidgetTheme): FeedbackButtonStyles => {
  return {
    triggerButton: {
      position: 'absolute',
      bottom: 30,
      right: 30,
      backgroundColor: theme.background,
      padding: 15,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 5,
      shadowColor: theme.border,
      shadowOffset: { width: 1, height: 2 },
      shadowOpacity: 0.5,
      shadowRadius: 3,
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: theme.border,
    },
    triggerText: {
      color: theme.foreground,
      fontSize: 18,
    },
    triggerIcon: {
      width: 24,
      height: 24,
      padding: 2,
      marginEnd: 6,
      tintColor: theme.sentryLogo,
    },
  };
};

export const defaultScreenshotButtonStyles = defaultButtonStyles;

export const modalWrapper: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export const modalSheetContainer = (theme: FeedbackWidgetTheme): ViewStyle => {
  return {
    backgroundColor: theme.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    flex: 1,
  };
};

export const topSpacer: ViewStyle = {
  height: 64, // magic number
};

export default defaultStyles;
