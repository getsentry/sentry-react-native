import { logger } from '@sentry/core';
import * as React from 'react';
import type { NativeEventSubscription, NativeScrollEvent, NativeSyntheticEvent} from 'react-native';
import { Animated, Appearance, Dimensions, Easing, Modal, PanResponder, Platform, ScrollView, View } from 'react-native';

import { notWeb } from '../utils/environment';
import { FeedbackButton } from './FeedbackButton';
import { FeedbackWidget } from './FeedbackWidget';
import { modalSheetContainer, modalWrapper, topSpacer } from './FeedbackWidget.styles';
import { getTheme } from './FeedbackWidget.theme';
import type { FeedbackWidgetStyles } from './FeedbackWidget.types';
import { getFeedbackButtonOptions, getFeedbackOptions } from './integration';
import { lazyLoadAutoInjectFeedbackButtonIntegration,lazyLoadAutoInjectFeedbackIntegration } from './lazy';
import { isModalSupported } from './utils';

const PULL_DOWN_CLOSE_THRESHOLD = 200;
const SLIDE_ANIMATION_DURATION = 200;
const BACKGROUND_ANIMATION_DURATION = 200;

abstract class FeedbackManager {
  protected static _isVisible = false;
  protected static _setVisibility: (visible: boolean) => void;

  protected static get _feedbackComponentName(): string {
    throw new Error('Subclasses must override feedbackComponentName');
  }

  public static initialize(setVisibility: (visible: boolean) => void): void {
    this._setVisibility = setVisibility;
  }

  /**
   * For testing purposes only.
   */
  public static reset(): void {
    this._isVisible = false;
    this._setVisibility = undefined;
  }

  public static show(): void {
    if (this._setVisibility) {
      this._isVisible = true;
      this._setVisibility(true);
    } else {
      // This message should be always shown otherwise it's not possible to use the widget.
      // eslint-disable-next-line no-console
      console.warn(`[Sentry] ${this._feedbackComponentName} requires 'Sentry.wrap(RootComponent)' to be called before 'show${this._feedbackComponentName}()'.`);
    }
  }

  public static hide(): void {
    if (this._setVisibility) {
      this._isVisible = false;
      this._setVisibility(false);
    } else {
      // This message should be always shown otherwise it's not possible to use the widget.
      // eslint-disable-next-line no-console
      console.warn(`[Sentry] ${this._feedbackComponentName} requires 'Sentry.wrap(RootComponent)' before interacting with the widget.`);
    }
  }

  public static isFormVisible(): boolean {
    return this._isVisible;
  }
}

class FeedbackWidgetManager extends FeedbackManager {
  protected static get _feedbackComponentName(): string {
    return 'FeedbackWidget';
  }
}

class FeedbackButtonManager extends FeedbackManager {
  protected static get _feedbackComponentName(): string {
    return 'FeedbackButton';
  }
}

interface FeedbackWidgetProviderProps {
  children: React.ReactNode;
  styles?: FeedbackWidgetStyles;
}

interface FeedbackWidgetProviderState {
  isButtonVisible: boolean;
  isVisible: boolean;
  backgroundOpacity: Animated.Value;
  panY: Animated.Value;
  isScrollAtTop: boolean;
}

class FeedbackWidgetProvider extends React.Component<FeedbackWidgetProviderProps> {
  public state: FeedbackWidgetProviderState = {
    isButtonVisible: false,
    isVisible: false,
    backgroundOpacity: new Animated.Value(0),
    panY: new Animated.Value(Dimensions.get('screen').height),
    isScrollAtTop: true,
  };

  private _themeListener: NativeEventSubscription;

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

  public constructor(props: FeedbackWidgetProviderProps) {
    super(props);
    FeedbackButtonManager.initialize(this._setButtonVisibilityFunction);
    FeedbackWidgetManager.initialize(this._setVisibilityFunction);
  }

  /**
   * Add a listener to the theme change event.
   */
  public componentDidMount(): void {
    this._themeListener = Appearance.addChangeListener(() => {
      this.forceUpdate();
    });
  }

  /**
   * Clean up the theme listener.
   */
  public componentWillUnmount(): void {
    if (this._themeListener) {
      this._themeListener.remove();
    }
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

    const theme = getTheme();

    const { isButtonVisible, isVisible, backgroundOpacity } = this.state;

    const backgroundColor = backgroundOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.9)'],
    });

    // Wrapping the `Modal` component in a `View` component is necessary to avoid
    // issues like https://github.com/software-mansion/react-native-reanimated/issues/6035
    return (
      <>
        {this.props.children}
        {isButtonVisible && <FeedbackButton {...getFeedbackButtonOptions()}/>}
        {isVisible &&
          <Animated.View style={[modalWrapper, { backgroundColor }]} >
            <Modal visible={isVisible} transparent animationType="none" onRequestClose={this._handleClose} testID="feedback-form-modal">
              <View style={topSpacer}/>
              <Animated.View
                style={[modalSheetContainer(theme), { transform: [{ translateY: this.state.panY }] }]}
                {...this._panResponder.panHandlers}>
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                  onScroll={this._handleScroll}>
                  <FeedbackWidget {...getFeedbackOptions()}
                    onFormClose={this._handleClose}
                    onFormSubmitted={this._handleClose}
                  />
                </ScrollView>
              </Animated.View>
            </Modal>
          </Animated.View>
        }
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

  private _setButtonVisibilityFunction = (visible: boolean): void => {
    this.setState({ isButtonVisible: visible });
  };

  private _handleClose = (): void => {
    FeedbackWidgetManager.hide();
  };
}

const showFeedbackWidget = (): void => {
  lazyLoadAutoInjectFeedbackIntegration();
  FeedbackWidgetManager.show();
};

const resetFeedbackWidgetManager = (): void => {
  FeedbackWidgetManager.reset();
};

const showFeedbackButton = (): void => {
  lazyLoadAutoInjectFeedbackButtonIntegration();
  FeedbackButtonManager.show();
};

const hideFeedbackButton = (): void => {
  FeedbackButtonManager.hide();
};

const resetFeedbackButtonManager = (): void => {
  FeedbackButtonManager.reset();
};

export { showFeedbackButton, hideFeedbackButton, showFeedbackWidget, FeedbackWidgetProvider, resetFeedbackButtonManager, resetFeedbackWidgetManager };
