import { getCurrentHub } from '@sentry/hub';
import { UserFeedback } from '@sentry/types';

import { ReactNativeClient } from './client';

/**
 * Captures a user feedback and sends it to Sentry.
 */
export function captureUserFeedback(feedback: UserFeedback): void {
  getCurrentHub().getClient<ReactNativeClient>()?.captureUserFeedback(feedback);
}

export { User, UserFeedback } from '@sentry/types';
