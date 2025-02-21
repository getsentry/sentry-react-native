import { getClient, logger, setCurrentClient } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { defaultConfiguration } from '../../src/js/feedback/defaults';
import { FeedbackWidgetProvider, showFeedbackWidget } from '../../src/js/feedback/FeedbackWidgetManager';
import { feedbackIntegration } from '../../src/js/feedback/integration';
import { AUTO_INJECT_FEEDBACK_INTEGRATION_NAME } from '../../src/js/feedback/lazy';
import { isModalSupported } from '../../src/js/feedback/utils';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/feedback/utils', () => ({
  isModalSupported: jest.fn(),
}));

const mockedIsModalSupported = isModalSupported as jest.MockedFunction<typeof isModalSupported>;

beforeEach(() => {
  logger.error = jest.fn();
});

describe('FeedbackWidgetManager', () => {

  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
  });

  it('showFeedbackWidget displays the form when FeedbackWidgetProvider is used', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByText, getByTestId } = render(
      <FeedbackWidgetProvider>
        <Text>App Components</Text>
      </FeedbackWidgetProvider>
    );

    showFeedbackWidget();

    expect(getByTestId('feedback-form-modal')).toBeTruthy();
    expect(getByText('App Components')).toBeTruthy();
  });

  it('showFeedbackWidget does not display the form when Modal is not available', () => {
    mockedIsModalSupported.mockReturnValue(false);
    const { getByText, queryByTestId } = render(
      <FeedbackWidgetProvider>
        <Text>App Components</Text>
      </FeedbackWidgetProvider>
    );

    showFeedbackWidget();

    expect(queryByTestId('feedback-form-modal')).toBeNull();
    expect(getByText('App Components')).toBeTruthy();
    expect(logger.error).toHaveBeenLastCalledWith(
      'FeedbackWidget Modal is not supported in React Native < 0.71 with Fabric renderer.',
    );
  });

  it('showFeedbackWidget does not throw an error when FeedbackWidgetProvider is not used', () => {
    expect(() => {
      showFeedbackWidget();
    }).not.toThrow();
  });

  it('showFeedbackWidget displays the form with the feedbackIntegration options', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText } = render(
      <FeedbackWidgetProvider>
        <Text>App Components</Text>
      </FeedbackWidgetProvider>
    );

    const integration = feedbackIntegration({
      messagePlaceholder: 'Custom Message Placeholder',
      submitButtonLabel: 'Custom Submit Button',
    });
    getClient()?.addIntegration(integration);

    showFeedbackWidget();

    expect(getByPlaceholderText('Custom Message Placeholder')).toBeTruthy();
    expect(getByText('Custom Submit Button')).toBeTruthy();
  });

  it('showFeedbackWidget displays the form with the feedbackIntegration options merged with the defaults', () => {
    mockedIsModalSupported.mockReturnValue(true);
    const { getByPlaceholderText, getByText, queryByText } = render(
      <FeedbackWidgetProvider>
        <Text>App Components</Text>
      </FeedbackWidgetProvider>
    );

    const integration = feedbackIntegration({
      submitButtonLabel: 'Custom Submit Button',
    });
    getClient()?.addIntegration(integration);

    showFeedbackWidget();

    expect(queryByText(defaultConfiguration.submitButtonLabel)).toBeFalsy(); // overridden value
    expect(getByText('Custom Submit Button')).toBeTruthy(); // overridden value
    expect(getByPlaceholderText(defaultConfiguration.messagePlaceholder)).toBeTruthy(); // default configuration value
  });

  it('showFeedbackWidget adds the feedbackIntegration to the client', () => {
    mockedIsModalSupported.mockReturnValue(true);

    showFeedbackWidget();

    expect(getClient().getIntegrationByName(AUTO_INJECT_FEEDBACK_INTEGRATION_NAME)).toBeDefined();
  });
});
