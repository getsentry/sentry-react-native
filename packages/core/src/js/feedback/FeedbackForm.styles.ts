import type { ViewStyle } from 'react-native';

import type { FeedbackButtonStyles, FeedbackFormStyles } from './FeedbackForm.types';

const PURPLE = 'rgba(88, 74, 192, 1)';
const FORGROUND_COLOR = '#2b2233';
const BACKROUND_COLOR = '#ffffff';
const BORDER_COLOR = 'rgba(41, 35, 47, 0.13)';

const defaultStyles: FeedbackFormStyles = {
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: BACKROUND_COLOR,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'left',
    flex: 1,
    color: FORGROUND_COLOR,
  },
  label: {
    marginBottom: 4,
    fontSize: 16,
    color: FORGROUND_COLOR,
  },
  input: {
    height: 50,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
    color: FORGROUND_COLOR,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    color: FORGROUND_COLOR,
  },
  screenshotButton: {
    backgroundColor: '#eee',
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
    alignItems: 'center',
  },
  screenshotText: {
    color: '#333',
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
    color: BACKROUND_COLOR,
    fontSize: 18,
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: FORGROUND_COLOR,
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
    backgroundColor: BACKROUND_COLOR,
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
    color: FORGROUND_COLOR,
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

export const modalBackground: ViewStyle = {
  flex: 1,
  justifyContent: 'flex-end',
};

export const modalSheetContainer: ViewStyle = {
  backgroundColor: '#ffffff',
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  overflow: 'hidden',
  alignSelf: 'stretch',
  height: '92%',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -3 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 5,
};

export default defaultStyles;
