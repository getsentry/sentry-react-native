import { debug } from '@sentry/core';
import * as React from 'react';
import {
  Animated,
  Appearance,
  Dimensions,
  Easing,
  Modal,
  type NativeEventSubscription,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  ScrollView,
  View,
} from 'react-native';

import type { FeedbackFormStyles } from './FeedbackForm.types';

import { notWeb } from '../utils/environment';
import { FeedbackButton } from './FeedbackButton';
import { FeedbackForm } from './FeedbackForm';
import { modalSheetContainer, modalWrapper, topSpacer } from './FeedbackForm.styles';
import { getTheme } from './FeedbackForm.theme';
import {
  BACKGROUND_ANIMATION_DURATION,
  FeedbackButtonManager,
  FeedbackFormManager,
  PULL_DOWN_CLOSE_THRESHOLD,
  ScreenshotButtonManager,
  showFeedbackForm,
  SLIDE_ANIMATION_DURATION,
} from './FeedbackFormManager';
import {
  getFeedbackButtonOptions,
  getFeedbackOptions,
  getScreenshotButtonOptions,
  isShakeToReportEnabled,
} from './integration';
import { lazyLoadShakeToReportIntegration } from './lazy';
import { ScreenshotButton } from './ScreenshotButton';
import { startShakeListener, stopShakeListener } from './ShakeToReportBug';
import { isModalSupported, isNativeDriverSupportedForColorAnimations } from './utils';

const useNativeDriverForColorAnimations = isNativeDriverSupportedForColorAnimations();

export interface FeedbackFormProviderProps {
  children: React.ReactNode;
  styles?: FeedbackFormStyles;
}

export interface FeedbackFormProviderState {
  isButtonVisible: boolean;
  isScreenshotButtonVisible: boolean;
  isVisible: boolean;
  backgroundOpacity: Animated.Value;
  panY: Animated.Value;
  isScrollAtTop: boolean;
}

/**
 * FeedbackFormProvider is a component that wraps the feedback widget and provides
 * functionality to show and hide the widget. It also manages the visibility of the
 * feedback button and screenshot button.
 */
export class FeedbackFormProvider extends React.Component<FeedbackFormProviderProps> {
  public state: FeedbackFormProviderState = {
    isButtonVisible: false,
    isScreenshotButtonVisible: false,
    isVisible: false,
    backgroundOpacity: new Animated.Value(0),
    panY: new Animated.Value(Dimensions.get('screen').height),
    isScrollAtTop: true,
  };

  private _themeListener: NativeEventSubscription | undefined;
  private _startedShakeListener: boolean = false;

  private _panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (_, gestureState) => {
      return notWeb() && this.state.isScrollAtTop && gestureState.dy > 0;
    },
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return notWeb() && this.state.isScrollAtTop && gestureState.dy > 0;
    },
    onPanResponderMove: (_, gestureState) => {
      if (gestureState.dy > 0) {
        this.state.panY.setValue(gestureState.dy);
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dy > PULL_DOWN_CLOSE_THRESHOLD) {
        // Close on swipe below a certain threshold
        Animated.timing(this.state.panY, {
          toValue: Dimensions.get('screen').height,
          duration: SLIDE_ANIMATION_DURATION,
          useNativeDriver: true,
        }).start(() => {
          this._handleClose();
        });
      } else {
        // Animate it back to the original position
        Animated.spring(this.state.panY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  public constructor(props: FeedbackFormProviderProps) {
    super(props);
    FeedbackButtonManager.initialize(this._setButtonVisibilityFunction);
    ScreenshotButtonManager.initialize(this._setScreenshotButtonVisibilityFunction);
    FeedbackFormManager.initialize(this._setVisibilityFunction);
  }

  /**
   * Add a listener to the theme change event and start shake detection if configured.
   */
  public componentDidMount(): void {
    this._themeListener = Appearance.addChangeListener(() => {
      this.forceUpdate();
    });

    if (isShakeToReportEnabled()) {
      lazyLoadShakeToReportIntegration();
      this._startedShakeListener = startShakeListener(showFeedbackForm);
    }
  }

  /**
   * Clean up the theme listener and stop shake detection.
   */
  public componentWillUnmount(): void {
    if (this._themeListener) {
      this._themeListener.remove();
    }

    if (this._startedShakeListener) {
      stopShakeListener();
    }
  }

  /**
   * Animates the background opacity when the modal is shown.
   */
  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  public componentDidUpdate(_prevProps: any, prevState: FeedbackFormProviderState): void {
    if (!prevState.isVisible && this.state.isVisible) {
      Animated.parallel([
        Animated.timing(this.state.backgroundOpacity, {
          toValue: 1,
          duration: BACKGROUND_ANIMATION_DURATION,
          useNativeDriver: useNativeDriverForColorAnimations,
          easing: Easing.in(Easing.quad),
        }),
        Animated.timing(this.state.panY, {
          toValue: 0,
          duration: SLIDE_ANIMATION_DURATION,
          useNativeDriver: true,
          easing: Easing.in(Easing.quad),
        }),
      ]).start(() => {
        debug.log('FeedbackFormProvider componentDidUpdate');
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
      debug.error('FeedbackForm Modal is not supported in React Native < 0.71 with Fabric renderer.');
      return <>{this.props.children}</>;
    }

    const theme = getTheme();

    const { isButtonVisible, isScreenshotButtonVisible, isVisible, backgroundOpacity } = this.state;

    const backgroundColor = backgroundOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.9)'],
    });

    // Wrapping the `Modal` component in a `View` component is necessary to avoid
    // issues like https://github.com/software-mansion/react-native-reanimated/issues/6035
    return (
      <>
        {this.props.children}
        {isButtonVisible && <FeedbackButton {...getFeedbackButtonOptions()} />}
        {isScreenshotButtonVisible && <ScreenshotButton {...getScreenshotButtonOptions()} />}
        {isVisible && (
          <Animated.View style={[modalWrapper, { backgroundColor }]}>
            <Modal
              visible={isVisible}
              transparent
              animationType="none"
              onRequestClose={this._handleClose}
              testID="feedback-form-modal"
            >
              <View style={topSpacer} />
              <Animated.View
                style={[modalSheetContainer(theme), { transform: [{ translateY: this.state.panY }] }]}
                {...this._panResponder.panHandlers}
              >
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                  onScroll={this._handleScroll}
                >
                  <FeedbackForm
                    {...getFeedbackOptions()}
                    onFormClose={this._handleClose}
                    onFormSubmitted={this._handleClose}
                  />
                </ScrollView>
              </Animated.View>
            </Modal>
          </Animated.View>
        )}
      </>
    );
  }

  private _handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    this.setState({ isScrollAtTop: event.nativeEvent.contentOffset.y <= 0 });
  };

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
          useNativeDriver: useNativeDriverForColorAnimations,
          easing: Easing.out(Easing.quad),
        }),
      ]).start(() => {
        // Change of the state unmount the component
        // which would cancel the animation
        updateState();
      });
    } else {
      updateState();
    }
  };

  private _setButtonVisibilityFunction = (visible: boolean): void => {
    this.setState({ isButtonVisible: visible });
  };

  private _setScreenshotButtonVisibilityFunction = (visible: boolean): void => {
    this.setState({ isScreenshotButtonVisible: visible });
  };

  private _handleClose = (): void => {
    FeedbackFormManager.hide();
  };
}
