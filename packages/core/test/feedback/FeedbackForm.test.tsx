import { captureFeedback } from '@sentry/core';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';

import { FeedbackForm } from '../../src/js/feedback/FeedbackForm';
import type { FeedbackFormProps } from '../../src/js/feedback/FeedbackForm.types';
import { checkInternetConnection } from '../../src/js/feedback/utils';

const mockOnFormClose = jest.fn();
const mockOnSubmitSuccess = jest.fn();
const mockOnFormSubmitted = jest.fn();
const mockOnSubmitError = jest.fn();

jest.spyOn(Alert, 'alert');

jest.mock('@sentry/core', () => ({
  ...jest.requireActual('@sentry/core'),
  captureFeedback: jest.fn(),
  getCurrentScope: jest.fn(() => ({
    getUser: jest.fn(() => ({
      email: 'test@example.com',
      name: 'Test User',
    })),
  })),
  lastEventId: jest.fn(),
}));
jest.mock('../../src/js/feedback/utils', () => ({
  ...jest.requireActual('../../src/js/feedback/utils'),
  checkInternetConnection: jest.fn(),
}));

const defaultProps: FeedbackFormProps = {
  onFormClose: mockOnFormClose,
  onSubmitSuccess: mockOnSubmitSuccess,
  onFormSubmitted: mockOnFormSubmitted,
  onSubmitError: mockOnSubmitError,
  formTitle: 'Feedback Form',
  nameLabel: 'Name',
  namePlaceholder: 'Name Placeholder',
  emailLabel: 'Email',
  emailPlaceholder: 'Email Placeholder',
  messageLabel: 'Description',
  messagePlaceholder: 'Description Placeholder',
  submitButtonLabel: 'Submit',
  cancelButtonLabel: 'Cancel',
  isRequiredLabel: '(required)',
  errorTitle: 'Error',
  formError: 'Please fill out all required fields.',
  emailError: 'The email address is not valid.',
  successMessageText: 'Feedback success',
  networkError: 'Network error',
  genericError: 'Generic error',
};

describe('FeedbackForm', () => {
  beforeEach(() => {
    (checkInternetConnection as jest.Mock).mockImplementation((onConnected, _onDisconnected, _onError) => {
      onConnected();
    });
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    expect(getByText(defaultProps.formTitle)).toBeTruthy();
    expect(getByText(defaultProps.nameLabel)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.namePlaceholder)).toBeTruthy();
    expect(getByText(defaultProps.emailLabel)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.emailPlaceholder)).toBeTruthy();
    expect(getByText(`${defaultProps.messageLabel } ${  defaultProps.isRequiredLabel}`)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.messagePlaceholder)).toBeTruthy();
    expect(getByText(defaultProps.submitButtonLabel)).toBeTruthy();
    expect(getByText(defaultProps.cancelButtonLabel)).toBeTruthy();
  });

  it('name and email are prefilled when sentry user is set', () => {
    const { getByPlaceholderText } = render(<FeedbackForm {...defaultProps} />);

    const nameInput = getByPlaceholderText(defaultProps.namePlaceholder);
    const emailInput = getByPlaceholderText(defaultProps.emailPlaceholder);

    expect(nameInput.props.value).toBe('Test User');
    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('shows an error message if required fields are empty', async () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.formError);
    });
  });

  it('shows an error message if the email is not valid and the email is required', async () => {
    const withEmailProps = {...defaultProps, ...{isEmailRequired: true}};
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...withEmailProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'not-an-email');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.emailError);
    });
  });

  it('calls captureFeedback when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(captureFeedback).toHaveBeenCalledWith({
        message: 'This is a feedback message.',
        name: 'John Doe',
        email: 'john.doe@example.com',
      });
    });
  });

  it('shows success message when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.successMessageText);
    });
  });

  it('shows an error message when there is no network connection', async () => {
    (checkInternetConnection as jest.Mock).mockImplementationOnce((_onConnected, onDisconnected, _onError) => {
      onDisconnected();
    });

    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.networkError);
    });
  });

  it('shows an error message when there is a generic connection', async () => {
    (checkInternetConnection as jest.Mock).mockImplementationOnce((_onConnected, _onDisconnected, onError) => {
      onError();
    });

    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.genericError);
    });
  });

  it('calls onSubmitError when there is an error', async () => {
    (checkInternetConnection as jest.Mock).mockImplementationOnce((_onConnected, _onDisconnected, onError) => {
      onError();
    });

    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnSubmitError).toHaveBeenCalled();
    });
  });

  it('calls onSubmitSuccess when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnSubmitSuccess).toHaveBeenCalled();
    });
  });

  it('calls onFormSubmitted when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnFormSubmitted).toHaveBeenCalled();
    });
  });

  it('calls onFormClose when the cancel button is pressed', () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.cancelButtonLabel));

    expect(mockOnFormClose).toHaveBeenCalled();
  });
});
