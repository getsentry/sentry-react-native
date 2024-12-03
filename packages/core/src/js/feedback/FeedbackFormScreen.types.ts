import type { TextStyle, ViewStyle } from 'react-native';

export interface FeedbackFormScreenProps {
  closeScreen: () => void;
  chooseFile?: (attachFile: (filename: string, base64Attachment: string | Uint8Array) => void) => void;
  text: FeedbackFormText;
  styles?: FeedbackFormScreenStyles;
}

export interface FeedbackFormText {
  formTitle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  descriptionPlaceholder?: string;
  attachmentButton?: string;
  submitButton?: string;
  cancelButton?: string;
  errorTitle?: string;
  formError?: string;
  emailError?: string;
}

export interface FeedbackFormScreenStyles {
  container?: ViewStyle;
  title?: TextStyle;
  input?: TextStyle;
  textArea?: ViewStyle;
  attachmentButton?: ViewStyle;
  attachmentText?: TextStyle;
  submitButton?: ViewStyle;
  submitText?: TextStyle;
  cancelButton?: ViewStyle;
  cancelText?: TextStyle;
}

export interface FeedbackFormScreenState {
  name: string;
  email: string;
  description: string;
  filename?: string;
  attachment?: string | Uint8Array;
}
