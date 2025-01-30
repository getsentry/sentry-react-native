import { logger } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { defaultConfiguration } from '../../src/js/feedback/defaults';
import { FeedbackFormProvider, showFeedbackForm } from '../../src/js/feedback/FeedbackFormManager';
import { feedbackIntegration } from '../../src/js/feedback/integration';
import { isModalSupported } from '../../src/js/feedback/utils';

jest.mock('../../src/js/feedback/utils', () => ({
  isModalSupported: jest.fn(),
}));

const mockedIsModalSupported = isModalSupported as jest.MockedFunction<typeof isModalSupported>;

beforeEach(() => {
  logger.error = jest.fn();
});

describe('FeedbackFormManager', () => {
  it('showFeedbackForm displays the form when FeedbackFormProvider is used', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByText, getByTestId } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    showFeedbackForm();

    expect(getByTestId('feedback-form-modal')).toBeTruthy();
    expect(getByText('App Components')).toBeTruthy();
  });

  it('showFeedbackForm does not display the form when Modal is not available', () => {
    mockedIsModalSupported.mockReturnValue(false);
    const { getByText, queryByTestId } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    showFeedbackForm();

    expect(queryByTestId('feedback-form-modal')).toBeNull();
    expect(getByText('App Components')).toBeTruthy();
    expect(logger.error).toHaveBeenLastCalledWith(
      'FeedbackForm Modal is not supported in React Native < 0.71 with Fabric renderer.',
    );
  });

  it('showFeedbackForm does not throw an error when FeedbackFormProvider is not used', () => {
    expect(() => {
      showFeedbackForm();
    }).not.toThrow();
  });

  it('showFeedbackForm displays the form with the feedbackIntegration options', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    feedbackIntegration({
      messagePlaceholder: 'Custom Message Placeholder',
      submitButtonLabel: 'Custom Submit Button',
    });

    showFeedbackForm();

    expect(getByPlaceholderText('Custom Message Placeholder')).toBeTruthy();
    expect(getByText('Custom Submit Button')).toBeTruthy();
  });

  it('showFeedbackForm displays the form with the feedbackIntegration options merged with the defaults', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText, queryByText } = render(
      <FeedbackFormProvider>
        <Text>App Components</Text>
      </FeedbackFormProvider>
    );

    feedbackIntegration({
      submitButtonLabel: 'Custom Submit Button',
    }),

    showFeedbackForm();

    expect(queryByText(defaultConfiguration.submitButtonLabel)).toBeFalsy(); // overridden value
    expect(getByText('Custom Submit Button')).toBeTruthy(); // overridden value
    expect(getByPlaceholderText(defaultConfiguration.messagePlaceholder)).toBeTruthy(); // default configuration value
  });
});
