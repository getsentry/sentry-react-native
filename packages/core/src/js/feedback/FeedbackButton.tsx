
import * as React from 'react';
import { Image, Text, TouchableOpacity } from 'react-native';

import { defaultButtonConfiguration } from './defaults';
import { defaultButtonStyles } from './FeedbackWidget.styles';
import type { FeedbackButtonProps, FeedbackButtonStyles, FeedbackButtonTextConfiguration } from './FeedbackWidget.types';
import { showFeedbackWidget } from './FeedbackWidgetManager';
import { feedbackIcon } from './icons';

/**
 * @beta
 * Implements a feedback button that opens the FeedbackForm.
 */
export class FeedbackButton extends React.Component<FeedbackButtonProps> {
  /**
   *
   */
  public render(): React.ReactNode {
    const text: FeedbackButtonTextConfiguration = { ...defaultButtonConfiguration, ...this.props };
    const styles: FeedbackButtonStyles = { ...defaultButtonStyles, ...this.props.styles };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => showFeedbackWidget()}
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: feedbackIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText}>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}
