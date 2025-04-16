import type { FeedbackButtonProps, FeedbackWidgetProps, ScreenshotButtonProps } from './FeedbackWidget.types';
import { feedbackAlertDialog } from './utils';

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
const TRIGGER_SCREENSHOT_LABEL = 'Take Screenshot';
const ERROR_TITLE = 'Error';
const FORM_ERROR = 'Please fill out all required fields.';
const EMAIL_ERROR = 'Please enter a valid email address.';
const CAPTURE_SCREENSHOT_ERROR = 'Error capturing screenshot. Please try again.';
const SUCCESS_MESSAGE_TEXT = 'Thank you for your report!';
const ADD_SCREENSHOT_LABEL = 'Add a screenshot';
const CAPTURE_SCREENSHOT_LABEL = 'Take a screenshot';
const REMOVE_SCREENSHOT_LABEL = 'Remove screenshot';
const GENERIC_ERROR_TEXT = 'Unable to send feedback due to an unexpected error.';

export const defaultConfiguration: Partial<FeedbackWidgetProps> = {
  // FeedbackCallbacks
  onFormOpen: () => {
    // Does nothing by default
  },
  onFormClose: () => {
    if (__DEV__) {
      feedbackAlertDialog(
        'Development note',
        'onFormClose callback is not implemented. By default the form is just unmounted.',
      );
    }
  },
  onAddScreenshot: (_: (uri: string) => void) => {
    if (__DEV__) {
      feedbackAlertDialog('Development note', 'onAddScreenshot callback is not implemented.');
    }
  },
  onSubmitSuccess: () => {
    // Does nothing by default
  },
  onSubmitError: () => {
    // Does nothing by default
  },
  onFormSubmitted: () => {
    if (__DEV__) {
      feedbackAlertDialog(
        'Development note',
        'onFormSubmitted callback is not implemented. By default the form is just unmounted.',
      );
    }
  },

  // FeedbackGeneralConfiguration
  showBranding: true,
  isEmailRequired: false,
  shouldValidateEmail: true,
  isNameRequired: false,
  showEmail: true,
  showName: true,
  enableScreenshot: false,
  enableTakeScreenshot: false,

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
  captureScreenshotError: CAPTURE_SCREENSHOT_ERROR,
  successMessageText: SUCCESS_MESSAGE_TEXT,
  addScreenshotButtonLabel: ADD_SCREENSHOT_LABEL,
  removeScreenshotButtonLabel: REMOVE_SCREENSHOT_LABEL,
  captureScreenshotButtonLabel: CAPTURE_SCREENSHOT_LABEL,
  genericError: GENERIC_ERROR_TEXT,
};

export const defaultButtonConfiguration: Partial<FeedbackButtonProps> = {
  triggerLabel: TRIGGER_LABEL,
  triggerAriaLabel: '',
};

export const defaultScreenshotButtonConfiguration: Partial<ScreenshotButtonProps> = {
  triggerLabel: TRIGGER_SCREENSHOT_LABEL,
  triggerAriaLabel: '',
};
