import type { ViewStyle } from 'react-native';

import { getTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonStyles, FeedbackWidgetStyles } from './FeedbackWidget.types';

const defaultStyles: FeedbackWidgetStyles = {
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: getTheme().BACKGROUND_COLOR,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'left',
    flex: 1,
    color: getTheme().FOREGROUND_COLOR,
  },
  label: {
    marginBottom: 4,
    fontSize: 16,
    color: getTheme().FOREGROUND_COLOR,
  },
  input: {
    height: 50,
    borderColor: getTheme().BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
    color: getTheme().FOREGROUND_COLOR,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    color: getTheme().FOREGROUND_COLOR,
  },
  screenshotButton: {
    backgroundColor: getTheme().BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: getTheme().BORDER_COLOR,
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
    color: getTheme().FOREGROUND_COLOR,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: getTheme().BRANDING,
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitText: {
    color: getTheme().BACKGROUND_COLOR,
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: getTheme().BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: getTheme().BORDER_COLOR,
  },
  cancelText: {
    color: getTheme().FOREGROUND_COLOR,
    fontSize: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    width: '100%',
  },
  sentryLogo: {
    width: 40,
    height: 40,
    tintColor: getTheme().SENTRY_LOGO_COLOR,
  },
};

export const defaultButtonStyles: FeedbackButtonStyles = {
  triggerButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: getTheme().BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: getTheme().BORDER_COLOR,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    flexDirection: 'row',
  },
  triggerText: {
    color: getTheme().FOREGROUND_COLOR,
    fontSize: 18,
  },
  triggerIcon: {
    width: 24,
    height: 24,
    padding: 2,
    marginEnd: 6,
    tintColor: getTheme().SENTRY_LOGO_COLOR,
  },
};

export const modalWrapper: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export const modalSheetContainer: ViewStyle = {
  backgroundColor: getTheme().BACKGROUND_COLOR,
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

export const topSpacer: ViewStyle = {
  height: 64, // magic number
};

export default defaultStyles;
