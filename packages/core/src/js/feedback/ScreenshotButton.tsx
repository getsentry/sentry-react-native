import * as React from 'react';
import type { NativeEventSubscription} from 'react-native';
import { Appearance, Image, Text, TouchableOpacity } from 'react-native';

import type { Screenshot } from '../wrapper';
import { NATIVE } from '../wrapper';
import { defaultScreenshotButtonConfiguration } from './defaults';
import { defaultScreenshotButtonStyles } from './FeedbackWidget.styles';
import { getTheme } from './FeedbackWidget.theme';
import type { ScreenshotButtonProps, ScreenshotButtonStyles, ScreenshotButtonTextConfiguration } from './FeedbackWidget.types';
import { screenshotIcon } from './icons';
import { lazyLoadFeedbackIntegration } from './lazy';

const takeScreenshot = async (): Promise<void> => {
  const screenshots: Screenshot[] | null = await NATIVE.captureScreenshot();
  if (screenshots && screenshots.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hideScreenshotButton, showFeedbackWidget } = require('./FeedbackWidgetManager');
    hideScreenshotButton();
    showFeedbackWidget();
  }
};

/**
 * @beta
 * Implements a screenshot button that takes a screenshot.
 */
export class ScreenshotButton extends React.Component<ScreenshotButtonProps> {
  private _themeListener: NativeEventSubscription;

  public constructor(props: ScreenshotButtonProps) {
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
   * Renders the screenshot button.
   */
  public render(): React.ReactNode {
    const theme = getTheme();
    const text: ScreenshotButtonTextConfiguration = { ...defaultScreenshotButtonConfiguration, ...this.props };
    const styles: ScreenshotButtonStyles = {
      triggerButton: { ...defaultScreenshotButtonStyles(theme).triggerButton, ...this.props.styles?.triggerButton },
      triggerText: { ...defaultScreenshotButtonStyles(theme).triggerText, ...this.props.styles?.triggerText },
      triggerIcon: { ...defaultScreenshotButtonStyles(theme).triggerIcon, ...this.props.styles?.triggerIcon },
    };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={ takeScreenshot }
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: screenshotIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText}>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}
