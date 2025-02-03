
import * as React from 'react';
import { Image, Text, TouchableOpacity } from 'react-native';

import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormStyles, FeedbackTextConfiguration } from './FeedbackForm.types';
import { showFeedbackForm } from './FeedbackFormManager';
import { feedbackIcon } from './icons';

/**
 * @beta
 * Implements a feedback button that opens the FeedbackForm.
 */
export class FeedbackButton extends React.Component<FeedbackFormProps> {
  /**
   *
   */
  public render(): React.ReactNode {
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => showFeedbackForm()}
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: feedbackIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText}>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}
