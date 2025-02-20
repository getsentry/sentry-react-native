import type { ViewStyle } from 'react-native';

import type { FeedbackButtonStyles, FeedbackWidgetStyles } from './FeedbackWidget.types';

const PURPLE = 'rgba(88, 74, 192, 1)';
const FOREGROUND_COLOR = '#2b2233';
const BACKGROUND_COLOR = '#ffffff';
const BORDER_COLOR = 'rgba(41, 35, 47, 0.13)';

const defaultStyles: FeedbackWidgetStyles = {
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: BACKGROUND_COLOR,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'left',
    flex: 1,
    color: FOREGROUND_COLOR,
  },
  label: {
    marginBottom: 4,
    fontSize: 16,
    color: FOREGROUND_COLOR,
  },
  input: {
    height: 50,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
    color: FOREGROUND_COLOR,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    color: FOREGROUND_COLOR,
  },
  screenshotButton: {
    backgroundColor: BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
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
    color: FOREGROUND_COLOR,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: PURPLE,
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitText: {
    color: BACKGROUND_COLOR,
    fontSize: 18,
  },
  cancelButton: {
    backgroundColor: BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  cancelText: {
    color: FOREGROUND_COLOR,
    fontSize: 16,
  },
  titleContainer: {
    flexDirection: 'row',
    width: '100%',
  },
  sentryLogo: {
    width: 40,
    height: 40,
  },
};

export const defaultButtonStyles: FeedbackButtonStyles = {
  triggerButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: BACKGROUND_COLOR,
    padding: 15,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: BORDER_COLOR,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    flexDirection: 'row',
  },
  triggerText: {
    color: FOREGROUND_COLOR,
    fontSize: 18,
  },
  triggerIcon: {
    width: 24,
    height: 24,
    padding: 2,
    marginEnd: 6,
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
  backgroundColor: '#ffffff',
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
