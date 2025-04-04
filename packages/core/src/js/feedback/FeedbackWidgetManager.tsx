import { logger } from '@sentry/core';

import { isWeb  } from '../utils/environment';
import { lazyLoadAutoInjectFeedbackButtonIntegration,lazyLoadAutoInjectFeedbackIntegration, lazyLoadAutoInjectScreenshotButtonIntegration } from './lazy';

export const PULL_DOWN_CLOSE_THRESHOLD = 200;
export const SLIDE_ANIMATION_DURATION = 200;
export const BACKGROUND_ANIMATION_DURATION = 200;

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

/**
 * Provides functionality to show and hide the feedback widget.
 */
export class FeedbackWidgetManager extends FeedbackManager {
  /**
   * Returns the name of the feedback component.
   */
  protected static get _feedbackComponentName(): string {
    return 'FeedbackWidget';
  }
}

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

const showScreenshotButton = (): void => {
  if (isWeb()) {
    logger.warn('ScreenshotButton is not supported on Web.');
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

export { showFeedbackButton, hideFeedbackButton, showFeedbackWidget, showScreenshotButton, hideScreenshotButton, resetFeedbackButtonManager, resetFeedbackWidgetManager, resetScreenshotButtonManager };
