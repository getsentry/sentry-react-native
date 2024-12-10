import { captureFeedback } from '@sentry/core';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';

import { FeedbackForm } from '../../src/js/feedback/FeedbackForm';
import type { FeedbackFormProps } from '../../src/js/feedback/config';

const mockCloseScreen = jest.fn();

jest.spyOn(Alert, 'alert');

jest.mock('@sentry/core', () => ({
  captureFeedback: jest.fn(),
}));

const defaultProps: FeedbackFormProps = {
  closeScreen: mockCloseScreen,
  text: {
    formTitle: 'Feedback Form',
    namePlaceholder: 'Name',
    emailPlaceholder: 'Email',
    descriptionPlaceholder: 'Description',
    submitButton: 'Submit',
    cancelButton: 'Cancel',
    errorTitle: 'Error',
    formError: 'Please fill out all required fields.',
    emailError: 'The email address is not valid.',
  },
};

describe('FeedbackForm', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    expect(getByText(defaultProps.text.formTitle)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.text.namePlaceholder)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.text.emailPlaceholder)).toBeTruthy();
    expect(getByPlaceholderText(defaultProps.text.descriptionPlaceholder)).toBeTruthy();
    expect(getByText(defaultProps.text.submitButton)).toBeTruthy();
    expect(getByText(defaultProps.text.cancelButton)).toBeTruthy();
  });

  it('shows an error message if required fields are empty', async () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.text.submitButton));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.text.errorTitle, defaultProps.text.formError);
    });
  });

  it('shows an error message if the email is not valid', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.text.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.emailPlaceholder), 'not-an-email');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.descriptionPlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.text.submitButton));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.text.errorTitle, defaultProps.text.emailError);
    });
  });

  it('calls captureFeedback when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.text.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.descriptionPlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.text.submitButton));

    await waitFor(() => {
      expect(captureFeedback).toHaveBeenCalledWith({
        message: 'This is a feedback message.',
        name: 'John Doe',
        email: 'john.doe@example.com',
      });
    });
  });

  it('calls closeScreen when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.text.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.text.descriptionPlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.text.submitButton));

    await waitFor(() => {
      expect(mockCloseScreen).toHaveBeenCalled();
    });
  });

  it('calls closeScreen when the cancel button is pressed', () => {
    const { getByText } = render(<FeedbackForm {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.text.cancelButton));

    expect(mockCloseScreen).toHaveBeenCalled();
  });
});
