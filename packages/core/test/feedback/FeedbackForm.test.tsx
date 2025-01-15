import { captureFeedback } from '@sentry/core';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';

import { FeedbackForm } from '../../src/js/feedback/FeedbackForm';
import type { FeedbackFormProps, FeedbackFormStyles } from '../../src/js/feedback/FeedbackForm.types';

const mockOnFormClose = jest.fn();
const mockOnAddScreenshot = jest.fn();
const mockGetUser = jest.fn(() => ({
  email: 'test@example.com',
  name: 'Test User',
}));

jest.spyOn(Alert, 'alert');

jest.mock('@sentry/core', () => ({
  captureFeedback: jest.fn(),
  getCurrentScope: jest.fn(() => ({
    getUser: mockGetUser,
  })),
  lastEventId: jest.fn(),
}));

const defaultProps: FeedbackFormProps = {
  onFormClose: mockOnFormClose,
  onAddScreenshot: mockOnAddScreenshot,
  addScreenshotButtonLabel: 'Add Screenshot',
  formTitle: 'Feedback Form',
  nameLabel: 'Name Label',
  namePlaceholder: 'Name Placeholder',
  emailLabel: 'Email Label',
  emailPlaceholder: 'Email Placeholder',
  messageLabel: 'Message Label',
  messagePlaceholder: 'Message Placeholder',
  submitButtonLabel: 'Submit Button Label',
  cancelButtonLabel: 'Cancel Button Label',
  isRequiredLabel: '(is required label)',
  errorTitle: 'Error',
  formError: 'Please fill out all required fields.',
  emailError: 'The email address is not valid.',
  successMessageText: 'Feedback success',
};

const customStyles: FeedbackFormStyles = {
  container: {
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 20,
    color: '#ff0000',
  },
  label: {
    fontSize: 15,
    color: '#00ff00',
  },
  input: {
    height: 50,
    borderColor: '#0000ff',
    fontSize: 13,
    color: '#000000',
  },
  textArea: {
    height: 50,
    color: '#00ff00',
  },
  submitButton: {
    backgroundColor: '#ffff00',
  },
  submitText: {
    color: '#ff0000',
    fontSize: 12,
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelText: {
    color: '#ff0000',
    fontSize: 10,
  },
};

describe('FeedbackForm', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches the snapshot with default configuration', () => {
    const { toJSON } = render(<FeedbackForm/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom texts', () => {
    const { toJSON } = render(<FeedbackForm {...defaultProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom styles', () => {
    const customStyleProps = {styles: customStyles};
    const { toJSON } = render(<FeedbackForm {...customStyleProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders correctly', () => {
    const { getByPlaceholderText, getByText, getByTestId, queryByText } = render(<FeedbackForm {...defaultProps} />);

    expect(getByText(defaultProps.formTitle)).toBeTruthy();
    expect(getByTestId('sentry-logo')).toBeTruthy(); // default showBranding is true
    expect(getByText(defaultProps.nameLabel)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.namePlaceholder)).toBeTruthy();
    expect(getByText(defaultProps.emailLabel)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.emailPlaceholder)).toBeTruthy();
    expect(getByText(`${defaultProps.messageLabel } ${  defaultProps.isRequiredLabel}`)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.messagePlaceholder)).toBeTruthy();
    expect(queryByText(defaultProps.addScreenshotButtonLabel)).toBeNull(); // default false
    expect(getByText(defaultProps.submitButtonLabel)).toBeTruthy();
    expect(getByText(defaultProps.cancelButtonLabel)).toBeTruthy();
  });

  it('renders attachment button when the enableScreenshot is true', () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} enableScreenshot={true} />);

    expect(getByText(defaultProps.addScreenshotButtonLabel)).toBeTruthy();
  });

  it('does not render the sentry logo when showBranding is false', () => {
    const { queryByTestId } = render(<FeedbackForm {...defaultProps} showBranding={false} />);

    expect(queryByTestId('sentry-logo')).toBeNull();
  });

  it('name and email are prefilled when sentry user is set', () => {
    const { getByPlaceholderText } = render(<FeedbackForm {...defaultProps} />);

    const nameInput = getByPlaceholderText(defaultProps.namePlaceholder);
    const emailInput = getByPlaceholderText(defaultProps.emailPlaceholder);

    expect(nameInput.props.value).toBe('Test User');
    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('ensure getUser is called only after the component is rendered', () => {
    // Ensure getUser is not called before render
    expect(mockGetUser).not.toHaveBeenCalled();

    // Render the component
    render(<FeedbackForm />);

    // After rendering, check that getUser was called twice (email and name)
    expect(mockGetUser).toHaveBeenCalledTimes(2);
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
      }, undefined);
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

  it('calls onFormClose when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnFormClose).toHaveBeenCalled();
    });
  });

  it('calls onAddScreenshot when the screenshot button is pressed', async () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} enableScreenshot={true} />);

    fireEvent.press(getByText(defaultProps.addScreenshotButtonLabel));

    await waitFor(() => {
      expect(mockOnAddScreenshot).toHaveBeenCalled();
    });
  });

  it('calls onFormClose when the cancel button is pressed', () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.cancelButtonLabel));

    expect(mockOnFormClose).toHaveBeenCalled();
  });
});
