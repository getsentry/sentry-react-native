import { logger } from '@sentry/core';
import * as React from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, View } from 'react-native';

import { FeedbackWidget } from './FeedbackWidget';
import { modalBackground, modalSheetContainer, modalWrapper } from './FeedbackWidget.styles';
import type { FeedbackWidgetStyles } from './FeedbackWidget.types';
import { getFeedbackOptions } from './integration';
import { isModalSupported } from './utils';

class FeedbackWidgetManager {
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

interface FeedbackWidgetProviderProps {
  children: React.ReactNode;
  styles?: FeedbackWidgetStyles;
}

interface FeedbackWidgetProviderState {
  isVisible: boolean;
  backgroundOpacity: Animated.Value;
}

class FeedbackWidgetProvider extends React.Component<FeedbackWidgetProviderProps> {
  public state: FeedbackWidgetProviderState = {
    isVisible: false,
    backgroundOpacity: new Animated.Value(0),
  };

  public constructor(props: FeedbackWidgetProviderProps) {
    super(props);
    FeedbackWidgetManager.initialize(this._setVisibilityFunction);
  }

  /**
   * Animates the background opacity when the modal is shown.
   */
  public componentDidUpdate(_prevProps: any, prevState: FeedbackWidgetProviderState): void {
    if (!prevState.isVisible && this.state.isVisible) {
      Animated.timing(this.state.backgroundOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (prevState.isVisible && !this.state.isVisible) {
      this.state.backgroundOpacity.setValue(0);
    }
  }

  /**
   * Renders the feedback form modal.
   */
  public render(): React.ReactNode {
    if (!isModalSupported()) {
      logger.error('FeedbackWidget Modal is not supported in React Native < 0.71 with Fabric renderer.');
      return <>{this.props.children}</>;
    }

    const { isVisible, backgroundOpacity } = this.state;

    const backgroundColor = backgroundOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.9)'],
    });

    // Wrapping the `Modal` component in a `View` component is necessary to avoid
    // issues like https://github.com/software-mansion/react-native-reanimated/issues/6035
    return (
      <>
        {this.props.children}
        {isVisible && (
          <Animated.View style={[modalWrapper, { backgroundColor }]} >
            <Modal visible={isVisible} transparent animationType="slide" onRequestClose={this._handleClose} testID="feedback-form-modal">
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={modalBackground}
              >
                <View style={modalSheetContainer}>
                  <FeedbackWidget {...getFeedbackOptions()}
                    onFormClose={this._handleClose}
                    onFormSubmitted={this._handleClose}
                    />
                </View>
              </KeyboardAvoidingView>
            </Modal>
          </Animated.View>
        )}
      </>
    );
  }

  private _setVisibilityFunction = (visible: boolean): void => {
    this.setState({ isVisible: visible });
  };

  private _handleClose = (): void => {
    FeedbackWidgetManager.hide();
    this.setState({ isVisible: false });
  };
}

const showFeedbackWidget = (): void => {
  FeedbackWidgetManager.show();
};

export { showFeedbackWidget, FeedbackWidgetProvider };
