import type { TextStyle, ViewStyle } from 'react-native';

export interface FeedbackFormProps {
  closeScreen: () => void;
  text: FeedbackFormText;
  styles?: FeedbackFormStyles;
}

export interface FeedbackFormText {
  formTitle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  descriptionPlaceholder?: string;
  submitButton?: string;
  cancelButton?: string;
  errorTitle?: string;
  formError?: string;
  emailError?: string;
}

export interface FeedbackFormStyles {
  container?: ViewStyle;
  title?: TextStyle;
  input?: TextStyle;
  textArea?: ViewStyle;
  submitButton?: ViewStyle;
  submitText?: TextStyle;
  cancelButton?: ViewStyle;
  cancelText?: TextStyle;
}

export interface FeedbackFormState {
  name: string;
  email: string;
  description: string;
}
