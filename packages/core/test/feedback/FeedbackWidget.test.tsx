import { captureFeedback, getClient, setCurrentClient } from '@sentry/core';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert } from 'react-native';

import { FeedbackWidget } from '../../src/js/feedback/FeedbackWidget';
import type { FeedbackWidgetProps, FeedbackWidgetStyles, ImagePicker } from '../../src/js/feedback/FeedbackWidget.types';
import { MOBILE_FEEDBACK_INTEGRATION_NAME } from '../../src/js/feedback/integration';
import { getDefaultTestClientOptions,TestClient } from '../mocks/client';

const mockOnFormClose = jest.fn();
const mockOnAddScreenshot = jest.fn();
const mockOnSubmitSuccess = jest.fn();
const mockOnFormSubmitted = jest.fn();
const mockOnSubmitError = jest.fn();
const mockGetUser = jest.fn(() => ({
  email: 'test@example.com',
  name: 'Test User',
}));

jest.spyOn(Alert, 'alert');

jest.mock('@sentry/core', () => ({
  ...jest.requireActual('@sentry/core'),
  captureFeedback: jest.fn(),
  getCurrentScope: jest.fn(() => ({
    getUser: mockGetUser,
  })),
  lastEventId: jest.fn(),
}));

const defaultProps: FeedbackWidgetProps = {
  onFormClose: mockOnFormClose,
  onAddScreenshot: mockOnAddScreenshot,
  onSubmitSuccess: mockOnSubmitSuccess,
  onFormSubmitted: mockOnFormSubmitted,
  onSubmitError: mockOnSubmitError,
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
  genericError: 'Generic error',
};

const customStyles: FeedbackWidgetStyles = {
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
  screenshotButton: {
    backgroundColor: '#00ff00',
  },
  screenshotText: {
    color: '#0000ff',
    fontSize: 13,
  },
};

describe('FeedbackWidget', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches the snapshot with default configuration', () => {
    const { toJSON } = render(<FeedbackWidget/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom texts', () => {
    const { toJSON } = render(<FeedbackWidget {...defaultProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom styles', () => {
    const customStyleProps = {styles: customStyles};
    const { toJSON } = render(<FeedbackWidget {...customStyleProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with default configuration and screenshot button', () => {
    const { toJSON } = render(<FeedbackWidget enableScreenshot={true}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom texts and screenshot button', () => {
    const { toJSON } = render(<FeedbackWidget {...defaultProps} enableScreenshot={true}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom styles and screenshot button', () => {
    const customStyleProps = {styles: customStyles};
    const { toJSON } = render(<FeedbackWidget {...customStyleProps} enableScreenshot={true}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders correctly', () => {
    const { getByPlaceholderText, getByText, getByTestId, queryByText } = render(<FeedbackWidget {...defaultProps} />);

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
    const { getByText } = render(<FeedbackWidget {...defaultProps} enableScreenshot={true} />);

    expect(getByText(defaultProps.addScreenshotButtonLabel)).toBeTruthy();
  });

  it('does not render the sentry logo when showBranding is false', () => {
    const { queryByTestId } = render(<FeedbackWidget {...defaultProps} showBranding={false} />);

    expect(queryByTestId('sentry-logo')).toBeNull();
  });

  it('name and email are prefilled when sentry user is set', () => {
    const { getByPlaceholderText } = render(<FeedbackWidget {...defaultProps} />);

    const nameInput = getByPlaceholderText(defaultProps.namePlaceholder);
    const emailInput = getByPlaceholderText(defaultProps.emailPlaceholder);

    expect(nameInput.props.value).toBe('Test User');
    expect(emailInput.props.value).toBe('test@example.com');
  });

  it('ensure getUser is called only after the component is rendered', () => {
    // Ensure getUser is not called before render
    expect(mockGetUser).not.toHaveBeenCalled();

    // Render the component
    render(<FeedbackWidget />);

    // After rendering, check that getUser was called twice (email and name)
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it('shows an error message if required fields are empty', async () => {
    const { getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.formError);
    });
  });

  it('shows an error message if the email is not valid and the email is required', async () => {
    const withEmailProps = {...defaultProps, ...{isEmailRequired: true}};
    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...withEmailProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'not-an-email');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.emailError);
    });
  });

  it('calls captureFeedback when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

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
    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.successMessageText, '');
    });
  });

  it('shows an error message when there is a an error in captureFeedback', async () => {
    (captureFeedback as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(defaultProps.errorTitle, defaultProps.genericError);
    });
  });

  it('calls onSubmitError when there is an error', async () => {
    (captureFeedback as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnSubmitError).toHaveBeenCalled();
    });
  });

  it('calls onSubmitSuccess when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnSubmitSuccess).toHaveBeenCalled();
    });
  });

  it('calls onFormSubmitted when the form is submitted successfully', async () => {
    const { getByPlaceholderText, getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));

    await waitFor(() => {
      expect(mockOnFormSubmitted).toHaveBeenCalled();
    });
  });

  it('calls onAddScreenshot when the screenshot button is pressed and no image picker library is integrated', async () => {
    const { getByText } = render(<FeedbackWidget {...defaultProps} enableScreenshot={true} />);

    fireEvent.press(getByText(defaultProps.addScreenshotButtonLabel));

    await waitFor(() => {
      expect(mockOnAddScreenshot).toHaveBeenCalled();
    });
  });

  it('calls launchImageLibraryAsync when the expo-image-picker library is integrated', async () => {
    const mockLaunchImageLibrary = jest.fn().mockResolvedValue({
      assets: [{ fileName: "mock-image.jpg", uri: "file:///mock/path/image.jpg" }],
    });
    const mockImagePicker: jest.Mocked<ImagePicker> = {
      launchImageLibraryAsync: mockLaunchImageLibrary,
    };

    const { getByText } = render(<FeedbackWidget {...defaultProps} imagePicker={ mockImagePicker } />);

    fireEvent.press(getByText(defaultProps.addScreenshotButtonLabel));

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalled();
    });
  });

  it('calls launchImageLibrary when the react-native-image-picker library is integrated', async () => {
    const mockLaunchImageLibrary = jest.fn().mockResolvedValue({
      assets: [{ fileName: "mock-image.jpg", uri: "file:///mock/path/image.jpg" }],
    });
    const mockImagePicker: jest.Mocked<ImagePicker> = {
      launchImageLibrary: mockLaunchImageLibrary,
    };

    const { getByText } = render(<FeedbackWidget {...defaultProps} imagePicker={ mockImagePicker } />);

    fireEvent.press(getByText(defaultProps.addScreenshotButtonLabel));

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalled();
    });
  });

  it('calls onFormClose when the cancel button is pressed', () => {
    const { getByText } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.press(getByText(defaultProps.cancelButtonLabel));

    expect(mockOnFormClose).toHaveBeenCalled();
  });

  it('onUnmount the input is saved and restored when the form reopens', async () => {
    const { getByPlaceholderText, unmount } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    unmount();
    const { queryByPlaceholderText } = render(<FeedbackWidget {...defaultProps} />);

    expect(queryByPlaceholderText(defaultProps.namePlaceholder).props.value).toBe('John Doe');
    expect(queryByPlaceholderText(defaultProps.emailPlaceholder).props.value).toBe('john.doe@example.com');
    expect(queryByPlaceholderText(defaultProps.messagePlaceholder).props.value).toBe('This is a feedback message.');
  });

  it('onCancel the input is saved and restored when the form reopens', async () => {
    const { getByPlaceholderText, getByText, unmount } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.cancelButtonLabel));
    unmount();
    const { queryByPlaceholderText } = render(<FeedbackWidget {...defaultProps} />);

    expect(queryByPlaceholderText(defaultProps.namePlaceholder).props.value).toBe('John Doe');
    expect(queryByPlaceholderText(defaultProps.emailPlaceholder).props.value).toBe('john.doe@example.com');
    expect(queryByPlaceholderText(defaultProps.messagePlaceholder).props.value).toBe('This is a feedback message.');
  });

  it('onSubmit the saved input is cleared and not restored when the form reopens', async () => {
    const { getByPlaceholderText, getByText, unmount } = render(<FeedbackWidget {...defaultProps} />);

    fireEvent.changeText(getByPlaceholderText(defaultProps.namePlaceholder), 'John Doe');
    fireEvent.changeText(getByPlaceholderText(defaultProps.emailPlaceholder), 'john.doe@example.com');
    fireEvent.changeText(getByPlaceholderText(defaultProps.messagePlaceholder), 'This is a feedback message.');

    fireEvent.press(getByText(defaultProps.submitButtonLabel));
    unmount();
    const { queryByPlaceholderText } = render(<FeedbackWidget {...defaultProps} />);

    expect(queryByPlaceholderText(defaultProps.namePlaceholder).props.value).toBe('Test User');
    expect(queryByPlaceholderText(defaultProps.emailPlaceholder).props.value).toBe('test@example.com');
    expect(queryByPlaceholderText(defaultProps.messagePlaceholder).props.value).toBe('');
  });

  it('lazyLoadFeedbackIntegration is called when the FeedbackWidget is rendered', () => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();

    render(<FeedbackWidget {...defaultProps} />);

    expect(getClient().getIntegrationByName(MOBILE_FEEDBACK_INTEGRATION_NAME)).toBeDefined();
  });
});
