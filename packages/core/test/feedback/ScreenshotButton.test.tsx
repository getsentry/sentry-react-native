import { render } from '@testing-library/react-native';
import * as React from 'react';

import type { ScreenshotButtonProps, ScreenshotButtonStyles } from '../../src/js/feedback/FeedbackWidget.types';
import { ScreenshotButton } from '../../src/js/feedback/ScreenshotButton';

jest.mock('../../src/js/feedback/FeedbackWidgetManager', () => ({
  ...jest.requireActual('../../src/js/feedback/FeedbackWidgetManager'),
  showFeedbackWidget: jest.fn(),
  hideScreenshotButton: jest.fn(),
}));

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
  afterEach(() => {
    jest.clearAllMocks();
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
});
