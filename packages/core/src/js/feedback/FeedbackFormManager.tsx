import { logger } from '@sentry/core';
import * as React from 'react';
import { Modal, SafeAreaView, View } from 'react-native';

import { FeedbackForm } from './FeedbackForm';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormStyles } from './FeedbackForm.types';
import { getFeedbackOptions } from './integration';
import { isModalSupported } from './utils';

class FeedbackFormManager {
  private static _isVisible = false;
  private static _setVisibility: (visible: boolean) => void;

  public static initialize(setVisibility: (visible: boolean) => void): void {
    this._setVisibility = setVisibility;
  }

  public static show(): void {
    if (this._setVisibility) {
      this._isVisible = true;
      this._setVisibility(true);
    }
  }

  public static hide(): void {
    if (this._setVisibility) {
      this._isVisible = false;
      this._setVisibility(false);
    }
  }

  public static isFormVisible(): boolean {
    return this._isVisible;
  }
}

interface FeedbackFormProviderProps {
  children: React.ReactNode;
  styles?: FeedbackFormStyles;
}

class FeedbackFormProvider extends React.Component<FeedbackFormProviderProps> {
  public state = {
    isVisible: false,
  };

  public constructor(props: FeedbackFormProviderProps) {
    super(props);
    FeedbackFormManager.initialize(this._setVisibilityFunction);
  }

  /**
   * Renders the feedback form modal.
   */
  public render(): React.ReactNode {
    if (!isModalSupported()) {
      logger.error('FeedbackForm Modal is not supported in React Native < 0.71 with Fabric renderer.');
      return <>{this.props.children}</>;
    }

    const { isVisible } = this.state;
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };

    // Wrapping the `Modal` component in a `View` component is necessary to avoid
    // issues like https://github.com/software-mansion/react-native-reanimated/issues/6035
    return (
      <>
        {this.props.children}
        {isVisible && (
          <View>
            <Modal visible={isVisible} transparent animationType="slide" onRequestClose={this._handleClose} testID="feedback-form-modal">
              <SafeAreaView style={styles.modalBackground}>
                <View style={styles.modalSheetContainer}>
                  <FeedbackForm {...getFeedbackOptions()}
                    onFormClose={this._handleClose}
                    onFormSubmitted={this._handleClose}
                    />
                </View>
              </SafeAreaView>
            </Modal>
          </View>
        )}
      </>
    );
  }

  private _setVisibilityFunction = (visible: boolean): void => {
    this.setState({ isVisible: visible });
  };

  private _handleClose = (): void => {
    FeedbackFormManager.hide();
    this.setState({ isVisible: false });
  };
}

const showFeedbackForm = (): void => {
  FeedbackFormManager.show();
};

export { showFeedbackForm, FeedbackFormProvider };
