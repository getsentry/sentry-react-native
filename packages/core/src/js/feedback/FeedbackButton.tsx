import * as React from 'react';
import type { NativeEventSubscription} from 'react-native';
import { Appearance, Image, Text, TouchableOpacity } from 'react-native';

import { defaultButtonConfiguration } from './defaults';
import { defaultButtonStyles } from './FeedbackWidget.styles';
import { getTheme } from './FeedbackWidget.theme';
import type { FeedbackButtonProps, FeedbackButtonStyles, FeedbackButtonTextConfiguration } from './FeedbackWidget.types';
import { showFeedbackWidget } from './FeedbackWidgetManager';
import { feedbackIcon } from './icons';
import { lazyLoadFeedbackIntegration } from './lazy';

/**
 * @beta
 * Implements a feedback button that opens the FeedbackForm.
 */
export class FeedbackButton extends React.Component<FeedbackButtonProps> {
  private _themeListener: NativeEventSubscription;

  public constructor(props: FeedbackButtonProps) {
    super(props);
    lazyLoadFeedbackIntegration();
  }

  /**
   * Adds a listener for theme changes.
   */
  public componentDidMount(): void {
    this._themeListener = Appearance.addChangeListener(() => {
      this.forceUpdate();
    });
  }

  /**
   * Removes the theme listener.
   */
  public componentWillUnmount(): void {
    if (this._themeListener) {
      this._themeListener.remove();
    }
  }

  /**
   * Renders the feedback button.
   */
  public render(): React.ReactNode {
    const theme = getTheme();
    const text: FeedbackButtonTextConfiguration = { ...defaultButtonConfiguration, ...this.props };
    const styles: FeedbackButtonStyles = {
      triggerButton: { ...defaultButtonStyles(theme).triggerButton, ...this.props.styles?.triggerButton },
      triggerText: { ...defaultButtonStyles(theme).triggerText, ...this.props.styles?.triggerText },
      triggerIcon: { ...defaultButtonStyles(theme).triggerIcon, ...this.props.styles?.triggerIcon },
    };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={showFeedbackWidget}
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: feedbackIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText} testID='sentry-feedback-button'>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}
