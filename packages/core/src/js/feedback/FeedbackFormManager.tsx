import { debug } from '@sentry/core';

import { isWeb } from '../utils/environment';
import {
  lazyLoadAutoInjectFeedbackButtonIntegration,
  lazyLoadAutoInjectFeedbackIntegration,
  lazyLoadAutoInjectScreenshotButtonIntegration,
  lazyLoadShakeToReportIntegration,
} from './lazy';
import { startShakeListener, stopShakeListener } from './ShakeToReportBug';

export const PULL_DOWN_CLOSE_THRESHOLD = 200;
export const SLIDE_ANIMATION_DURATION = 200;
export const BACKGROUND_ANIMATION_DURATION = 200;

const NOOP_SET_VISIBILITY = (): void => {
  // No-op
};

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
    this._setVisibility = NOOP_SET_VISIBILITY;
  }

  public static show(): void {
    if (this._setVisibility !== NOOP_SET_VISIBILITY) {
      this._isVisible = true;
      this._setVisibility(true);
    } else {
      // This message should be always shown otherwise it's not possible to use the widget.
      // oxlint-disable-next-line eslint(no-console)
      console.warn(
        `[Sentry] ${this._feedbackComponentName} requires 'Sentry.wrap(RootComponent)' to be called before 'show${this._feedbackComponentName}()'.`,
      );
    }
  }

  public static hide(): void {
    if (this._setVisibility !== NOOP_SET_VISIBILITY) {
      this._isVisible = false;
      this._setVisibility(false);
    } else {
      // This message should be always shown otherwise it's not possible to use the widget.
      // oxlint-disable-next-line eslint(no-console)
      console.warn(
        `[Sentry] ${this._feedbackComponentName} requires 'Sentry.wrap(RootComponent)' before interacting with the widget.`,
      );
    }
  }

  public static isFormVisible(): boolean {
    return this._isVisible;
  }
}

/**
 * Provides functionality to show and hide the feedback form.
 */
export class FeedbackFormManager extends FeedbackManager {
  /**
   * Returns the name of the feedback component.
   */
  protected static get _feedbackComponentName(): string {
    return 'FeedbackForm';
  }
}

/** @deprecated Use `FeedbackFormManager` instead. */
export const FeedbackWidgetManager = FeedbackFormManager;

/**
 * Provides functionality to show and hide the feedback button.
 */
export class FeedbackButtonManager extends FeedbackManager {
  /**
   * Returns the name of the feedback component.
   */
  protected static get _feedbackComponentName(): string {
    return 'FeedbackButton';
  }
}

/**
 * Provides functionality to show and hide the screenshot button.
 */
export class ScreenshotButtonManager extends FeedbackManager {
  /**
   * Returns the name of the feedback component.
   */
  protected static get _feedbackComponentName(): string {
    return 'ScreenshotButton';
  }
}

const showFeedbackForm = (): void => {
  lazyLoadAutoInjectFeedbackIntegration();
  FeedbackFormManager.show();
};

const resetFeedbackFormManager = (): void => {
  FeedbackFormManager.reset();
};

/** @deprecated Use `showFeedbackForm` instead. */
const showFeedbackWidget = showFeedbackForm;

/** @deprecated Use `resetFeedbackFormManager` instead. */
const resetFeedbackWidgetManager = resetFeedbackFormManager;

/** @deprecated `showFeedbackButton` will be removed in a future major version. */
const showFeedbackButton = (): void => {
  lazyLoadAutoInjectFeedbackButtonIntegration();
  FeedbackButtonManager.show();
};

/** @deprecated `hideFeedbackButton` will be removed in a future major version. */
const hideFeedbackButton = (): void => {
  FeedbackButtonManager.hide();
};

const resetFeedbackButtonManager = (): void => {
  FeedbackButtonManager.reset();
};

const showScreenshotButton = (): void => {
  if (isWeb()) {
    debug.warn('ScreenshotButton is not supported on Web.');
    return;
  }
  lazyLoadAutoInjectScreenshotButtonIntegration();
  ScreenshotButtonManager.show();
};

const hideScreenshotButton = (): void => {
  ScreenshotButtonManager.hide();
};

const resetScreenshotButtonManager = (): void => {
  ScreenshotButtonManager.reset();
};

let _imperativeShakeListenerStarted = false;

const enableFeedbackOnShake = (): void => {
  lazyLoadAutoInjectFeedbackIntegration();
  lazyLoadShakeToReportIntegration();
  if (!_imperativeShakeListenerStarted) {
    _imperativeShakeListenerStarted = startShakeListener(showFeedbackForm);
  }
};

const disableFeedbackOnShake = (): void => {
  if (_imperativeShakeListenerStarted) {
    stopShakeListener();
    _imperativeShakeListenerStarted = false;
  }
};

export {
  showFeedbackButton,
  hideFeedbackButton,
  showFeedbackForm,
  showFeedbackWidget,
  enableFeedbackOnShake,
  disableFeedbackOnShake,
  showScreenshotButton,
  hideScreenshotButton,
  resetFeedbackButtonManager,
  resetFeedbackFormManager,
  resetFeedbackWidgetManager,
  resetScreenshotButtonManager,
};
