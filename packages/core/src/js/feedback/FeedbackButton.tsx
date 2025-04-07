import * as React from 'react';
import { Image, Text, TouchableOpacity } from 'react-native';

import { defaultButtonConfiguration } from './defaults';
import { defaultButtonStyles } from './FeedbackWidget.styles';
import type { FeedbackButtonProps, FeedbackButtonStyles, FeedbackButtonTextConfiguration } from './FeedbackWidget.types';
import { feedbackIcon } from './icons';
import { lazyLoadFeedbackIntegration } from './lazy';

const showFeedbackWidget = (): void => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { showFeedbackWidget } = require('./FeedbackWidgetManager');
  showFeedbackWidget();
};

/**
 * @beta
 * Implements a feedback button that opens the FeedbackForm.
 */
export class FeedbackButton extends React.Component<FeedbackButtonProps> {
  public constructor(props: FeedbackButtonProps) {
    super(props);
    lazyLoadFeedbackIntegration();
  }

  /**
   * Renders the feedback button.
   */
  public render(): React.ReactNode {
    const text: FeedbackButtonTextConfiguration = { ...defaultButtonConfiguration, ...this.props };
    const styles: FeedbackButtonStyles = {
      triggerButton: { ...defaultButtonStyles.triggerButton, ...this.props.styles?.triggerButton },
      triggerText: { ...defaultButtonStyles.triggerText, ...this.props.styles?.triggerText },
      triggerIcon: { ...defaultButtonStyles.triggerIcon, ...this.props.styles?.triggerIcon },
    };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={showFeedbackWidget}
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: feedbackIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText}>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}
