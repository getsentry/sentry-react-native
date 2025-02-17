import { logger } from '@sentry/core';
import * as React from 'react';
import { Animated, Dimensions, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform } from 'react-native';

import { FeedbackWidget } from './FeedbackWidget';
import { modalBackground, modalSheetContainer, modalWrapper } from './FeedbackWidget.styles';
import type { FeedbackWidgetStyles } from './FeedbackWidget.types';
import { getFeedbackOptions } from './integration';
import { isModalSupported } from './utils';

const PULL_DOWN_CLOSE_THREESHOLD = 200;
const PULL_DOWN_ANDROID_ACTIVATION_HEIGHT = 150;
const SLIDE_ANIMATION_DURATION = 200;
const BACKGROUND_ANIMATION_DURATION = 200;

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
  panY: Animated.Value;
}

class FeedbackWidgetProvider extends React.Component<FeedbackWidgetProviderProps> {
  public state: FeedbackWidgetProviderState = {
    isVisible: false,
    backgroundOpacity: new Animated.Value(0),
    panY: new Animated.Value(Dimensions.get('screen').height),
  };

  private _panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, _gestureState) => {
      // On Android allow pulling down only from the top to avoid breaking native gestures
      return Platform.OS !== 'android' || evt.nativeEvent.pageY < PULL_DOWN_ANDROID_ACTIVATION_HEIGHT;
    },
    onMoveShouldSetPanResponder: (evt, _gestureState) => {
      return Platform.OS !== 'android' || evt.nativeEvent.pageY < PULL_DOWN_ANDROID_ACTIVATION_HEIGHT;
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        this.state.panY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > PULL_DOWN_CLOSE_THREESHOLD) { // Close on swipe below a certain threshold
        Animated.timing(this.state.panY, {
          toValue: Dimensions.get('screen').height,
          duration: SLIDE_ANIMATION_DURATION,
          useNativeDriver: true,
        }).start(() => {
          this._handleClose();
        });
      } else { // Animate it back to the original position
        Animated.spring(this.state.panY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  public constructor(props: FeedbackWidgetProviderProps) {
    super(props);
    FeedbackWidgetManager.initialize(this._setVisibilityFunction);
  }

  /**
   * Animates the background opacity when the modal is shown.
   */
  public componentDidUpdate(_prevProps: any, prevState: FeedbackWidgetProviderState): void {
    if (!prevState.isVisible && this.state.isVisible) {
      Animated.parallel([
        Animated.timing(this.state.backgroundOpacity, {
          toValue: 1,
          duration: BACKGROUND_ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
        Animated.timing(this.state.panY, {
          toValue: 0,
          duration: SLIDE_ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        })
      ]).start(() => {
        logger.info('FeedbackWidgetProvider componentDidUpdate');
      });
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
            <Modal visible={isVisible} transparent animationType="none" onRequestClose={this._handleClose} testID="feedback-form-modal">
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={modalBackground}
              >
                <Animated.View
                  style={[modalSheetContainer, { transform: [{ translateY: this.state.panY }] }]}
                  {...this._panResponder.panHandlers}
                >
                  <FeedbackWidget {...getFeedbackOptions()}
                    onFormClose={this._handleClose}
                    onFormSubmitted={this._handleClose}
                    />
                </Animated.View>
              </KeyboardAvoidingView>
            </Modal>
          </Animated.View>
        )}
      </>
    );
  }

  private _setVisibilityFunction = (visible: boolean): void => {
    const updateState = (): void => {
      this.setState({ isVisible: visible });
    };
    if (!visible) {
      Animated.parallel([
        Animated.timing(this.state.panY, {
          toValue: Dimensions.get('screen').height,
          duration: SLIDE_ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(this.state.backgroundOpacity, {
          toValue: 0,
          duration: BACKGROUND_ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        })
      ]).start(() => {
        // Change of the state unmount the component
        // which would cancel the animation
        updateState();
      });
    } else {
      updateState();
    }
  };

  private _handleClose = (): void => {
    FeedbackWidgetManager.hide();
  };
}

const showFeedbackWidget = (): void => {
  FeedbackWidgetManager.show();
};

export { showFeedbackWidget, FeedbackWidgetProvider };
