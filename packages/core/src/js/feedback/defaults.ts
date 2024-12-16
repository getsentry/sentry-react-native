import { Alert } from 'react-native';

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
const TRIGGER_LABEL = 'Report a Bug';
const ERROR_TITLE = 'Error';
const FORM_ERROR = 'Please fill out all required fields.';
const EMAIL_ERROR = 'Please enter a valid email address.';
const SUCCESS_MESSAGE_TEXT = 'Thank you for your report!';

export const defaultConfiguration: Partial<FeedbackFormProps> = {
  // FeedbackCallbacks
  onFormClose: () => {
    if (__DEV__) {
      Alert.alert(
        'Development note',
        'onFormClose callback is not implemented. By default the form is just unmounted.',
      );
    }
  },

  // FeedbackGeneralConfiguration
  isEmailRequired: false,
  shouldValidateEmail: true,
  isNameRequired: false,
  showEmail: true,
  showName: true,

  // FeedbackTextConfiguration
  triggerLabel: TRIGGER_LABEL,
  triggerAriaLabel: '',
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
  successMessageText: SUCCESS_MESSAGE_TEXT,
};
