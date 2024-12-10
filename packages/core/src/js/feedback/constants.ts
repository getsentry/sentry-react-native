import type { FeedbackFormProps } from './FeedbackForm.types';

const FORM_TITLE = 'Report a Bug';
const NAME_PLACEHOLDER = 'Your Name';
const NAME_LABEL = 'Name';
const EMAIL_PLACEHOLDER = 'your.email@example.org';
const EMAIL_LABEL = 'Email';
const MESSAGE_PLACEHOLDER = "What's the bug? What did you expect?";
const MESSAGE_LABEL = 'Description';
const IS_REQUIRED_LABEL = '(required)';
const SUBMIT_BUTTON_LABEL = 'Send Bug Report';
const CANCEL_BUTTON_LABEL = 'Cancel';
const ERROR_TITLE = 'Error';
const FORM_ERROR = 'Please fill out all required fields.';
const EMAIL_ERROR = 'Please enter a valid email address.';

export const defaultConfiguration: Partial<FeedbackFormProps> = {
  // FeedbackTextConfiguration
  cancelButtonLabel: CANCEL_BUTTON_LABEL,
  emailLabel: EMAIL_LABEL,
  emailPlaceholder: EMAIL_PLACEHOLDER,
  formTitle: FORM_TITLE,
  isRequiredLabel: IS_REQUIRED_LABEL,
  messageLabel: MESSAGE_LABEL,
  messagePlaceholder: MESSAGE_PLACEHOLDER,
  nameLabel: NAME_LABEL,
  namePlaceholder: NAME_PLACEHOLDER,
  submitButtonLabel: SUBMIT_BUTTON_LABEL,
  errorTitle: ERROR_TITLE,
  formError: FORM_ERROR,
  emailError: EMAIL_ERROR,
};
