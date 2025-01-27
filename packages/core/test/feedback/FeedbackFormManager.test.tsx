import { logger } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { FeedbackFormProvider, showFeedbackForm } from '../../src/js/feedback/FeedbackFormManager';

jest.mock('../../src/js/feedback/utils', () => ({
  isModalSupported: jest.fn(),
}));

beforeEach(() => {
  logger.error = jest.fn();
});

describe('FeedbackFormManager', () => {
  it('showFeedbackForm displays the form when FeedbackFormProvider is used', () => {
    require('../../src/js/feedback/utils').isModalSupported.mockReturnValue(true);
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
    require('../../src/js/feedback/utils').isModalSupported.mockReturnValue(false);
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
});
