import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

/**
 * The props for the feedback form
 */
export interface FeedbackFormProps extends FeedbackGeneralConfiguration, FeedbackTextConfiguration, FeedbackCallbacks {
  styles?: FeedbackFormStyles;
}

/**
 * General feedback configuration
 */
export interface FeedbackGeneralConfiguration {
  /**
   * Show the Sentry branding
   *
   * @default true
   */
  showBranding?: boolean;

  /**
   * Should the email field be required?
   */
  isEmailRequired?: boolean;

  /**
   * Should the email field be validated?
   */
  shouldValidateEmail?: boolean;

  /**
   * Should the name field be required?
   */
  isNameRequired?: boolean;

  /**
   * Should the email input field be visible? Note: email will still be collected if set via `Sentry.setUser()`
   */
  showEmail?: boolean;

  /**
   * Should the name input field be visible? Note: name will still be collected if set via `Sentry.setUser()`
   */
  showName?: boolean;

  /**
   * Fill in email/name input fields with Sentry user context if it exists.
   * The value of the email/name keys represent the properties of your user context.
   */
  useSentryUser?: {
    email: string;
    name: string;
  };
}

/**
 * All of the different text labels that can be customized
 */
export interface FeedbackTextConfiguration {
  /**
   * The label for the Feedback form cancel button that closes dialog
   */
  cancelButtonLabel?: string;

  /**
   * The label for the Feedback form submit button that sends feedback
   */
  submitButtonLabel?: string;

  /**
   * The title of the Feedback form
   */
  formTitle?: string;

  /**
   * Label for the email input
   */
  emailLabel?: string;

  /**
   * Placeholder text for Feedback email input
   */
  emailPlaceholder?: string;

  /**
   * Label for the message input
   */
  messageLabel?: string;

  /**
   * Placeholder text for Feedback message input
   */
  messagePlaceholder?: string;

  /**
   * Label for the name input
   */
  nameLabel?: string;

  /**
   * Message after feedback was sent successfully
   */
  successMessageText?: string;

  /**
   * Placeholder text for Feedback name input
   */
  namePlaceholder?: string;

  /**
   * Text which indicates that a field is required
   */
  isRequiredLabel?: string;

  /**
   * The title of the error dialog
   */
  errorTitle?: string;

  /**
   * The error message when the form is invalid
   */
  formError?: string;

  /**
   * The error message when the email is invalid
   */
  emailError?: string;
}

/**
 * The public callbacks available for the feedback integration
 */
export interface FeedbackCallbacks {
  /**
   * Callback when form is closed and not submitted
   */
  onFormClose?: () => void;
}

/**
 * The styles for the feedback form
 */
export interface FeedbackFormStyles {
  container?: ViewStyle;
  title?: TextStyle;
  label?: TextStyle;
  input?: TextStyle;
  textArea?: TextStyle;
  submitButton?: ViewStyle;
  submitText?: TextStyle;
  cancelButton?: ViewStyle;
  cancelText?: TextStyle;
  titleContainer?: ViewStyle;
  sentryLogo?: ImageStyle;
}

/**
 * The state of the feedback form
 */
export interface FeedbackFormState {
  isVisible: boolean;
  name: string;
  email: string;
  description: string;
}
