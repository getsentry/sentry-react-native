import { getClient, setCurrentClient } from '@sentry/core';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import type { ScreenshotButtonProps, ScreenshotButtonStyles } from '../../src/js/feedback/FeedbackWidget.types';
import { FeedbackWidgetProvider, resetFeedbackWidgetManager,showFeedbackButton } from '../../src/js/feedback/FeedbackWidgetManager';
import { feedbackIntegration } from '../../src/js/feedback/integration';
import { ScreenshotButton } from '../../src/js/feedback/ScreenshotButton';
import type { Screenshot } from '../../src/js/wrapper';
import { NATIVE  } from '../../src/js/wrapper';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

jest.mock('../../src/js/wrapper', () => ({
  NATIVE: {
    captureScreenshot: jest.fn(),
    encodeToBase64: jest.fn(),
  },
}));

const mockScreenshot: Screenshot = {
  filename: 'test-screenshot.png',
  contentType: 'image/png',
  data: new Uint8Array([1, 2, 3]),
};

const mockBase64Image = 'mockBase64ImageString';

const mockCaptureScreenshot = NATIVE.captureScreenshot as jest.Mock;
const mockEncodeToBase64 = NATIVE.encodeToBase64 as jest.Mock;

const defaultProps: ScreenshotButtonProps = {
  triggerLabel: 'Take Screenshot',
};

export const customStyles: ScreenshotButtonStyles = {
  triggerButton: {
    backgroundColor: '#ffffff',
  },
  triggerText: {
    color: '#ff0000',
  },
};

describe('ScreenshotButton', () => {
  beforeEach(() => {
    const client = new TestClient(getDefaultTestClientOptions());
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetFeedbackWidgetManager();
  });

  it('matches the snapshot with default configuration', () => {
    const { toJSON } = render(<ScreenshotButton/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom texts', () => {
    const { toJSON } = render(<ScreenshotButton {...defaultProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom styles', () => {
    const customStyleProps = {styles: customStyles};
    const { toJSON } = render(<ScreenshotButton {...customStyleProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('the feedback widget ui is updated when a screenshot is captured', async () => {
    mockCaptureScreenshot.mockResolvedValue([mockScreenshot]);
    mockEncodeToBase64.mockResolvedValue(mockBase64Image);

    const { getByText, queryByText } = render(
      <FeedbackWidgetProvider>
        <Text>App Components</Text>
      </FeedbackWidgetProvider>
    );

    const integration = feedbackIntegration({
      enableTakeScreenshot: true,
    });
    getClient()?.addIntegration(integration);

    showFeedbackButton();

    const reportButton = getByText('Report a Bug');
    expect(reportButton).toBeTruthy();
    fireEvent.press(reportButton);

    const takeScreenshotButton = getByText('Take a screenshot');
    expect(takeScreenshotButton).toBeTruthy();
    fireEvent.press(takeScreenshotButton);

    const captureButton = getByText('Take Screenshot');
    expect(captureButton).toBeTruthy();
    fireEvent.press(captureButton);

    await waitFor(() => {
      expect(mockCaptureScreenshot).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockEncodeToBase64).toHaveBeenCalled();
    });

    await waitFor(() => {
      const removeScreenshotButton = getByText('Remove screenshot');
      expect(removeScreenshotButton).toBeTruthy();
    });

    const takeScreenshotButtonAfterCapture = queryByText('Take a screenshot');
    expect(takeScreenshotButtonAfterCapture).toBeNull();
  });
});
