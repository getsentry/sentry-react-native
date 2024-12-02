import type { TextStyle, ViewStyle } from 'react-native';

export interface FeedbackFormScreenProps {
  closeScreen: () => void;
  text: FeedbackFormText;
  styles?: FeedbackFormScreenStyles;
}

export interface FeedbackFormText {
  formTitle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  descriptionPlaceholder?: string;
  submitButton?: string;
  cancelButton?: string;
  formError?: string;
  emailError?: string;
}

export interface FeedbackFormScreenStyles {
  container?: ViewStyle;
  title?: TextStyle;
  input?: TextStyle;
  textArea?: ViewStyle;
  submitButton?: ViewStyle;
  submitText?: TextStyle;
  cancelButton?: ViewStyle;
  cancelText?: TextStyle;
}

export interface FeedbackFormScreenState {
  name: string;
  email: string;
  description: string;
}
