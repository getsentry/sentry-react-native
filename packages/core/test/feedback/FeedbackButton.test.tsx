import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as React from 'react';

import { FeedbackButton } from '../../src/js/feedback/FeedbackButton';
import type { FeedbackButtonProps, FeedbackButtonStyles } from '../../src/js/feedback/FeedbackWidget.types';
import { showFeedbackWidget } from '../../src/js/feedback/FeedbackWidgetManager';

jest.mock('../../src/js/feedback/FeedbackWidgetManager', () => ({
  ...jest.requireActual('../../src/js/feedback/FeedbackWidgetManager'),
  showFeedbackWidget: jest.fn(),
}));

const customTextProps: FeedbackButtonProps = {
  triggerLabel: 'Give Feedback',
};

export const customStyles: FeedbackButtonStyles = {
  triggerButton: {
    backgroundColor: '#ffffff',
  },
  triggerText: {
    color: '#ff0000',
  },
};

describe('FeedbackButton', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('matches the snapshot with default configuration', () => {
    const { toJSON } = render(<FeedbackButton/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom texts', () => {
    const { toJSON } = render(<FeedbackButton {...customTextProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches the snapshot with custom styles', () => {
    const customStyleProps = {styles: customStyles};
    const { toJSON } = render(<FeedbackButton {...customStyleProps}/>);
    expect(toJSON()).toMatchSnapshot();
  });

  it('shows the feedback widget when pressed', async () => {
    const { getByText } = render(<FeedbackButton {...customTextProps} />);

    fireEvent.press(getByText(customTextProps.triggerLabel));

    await waitFor(() => {
      expect(showFeedbackWidget).toHaveBeenCalled();
    });
  });
});
