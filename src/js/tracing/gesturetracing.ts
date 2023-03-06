import { getCurrentHub } from '@sentry/core';
import type { Hub } from '@sentry/types';
import { logger } from '@sentry/utils';

import { ACTION_GESTURE_OP } from './operations';
import { ReactNativeTracing } from './reactnativetracing';

/**
 * Internal interface following RNGH 2 Gesture Event API.
 * We need to use this to avoid importing RNGH 2 types and depending on it.
 * https://github.com/software-mansion/react-native-gesture-handler/blob/2.9.0/src/handlers/gestures/gesture.ts#L55
 * @hidden
 */
type GestureEvent = Record<string, unknown>

/**
 * Internal interface for RNGH 2 Gesture API.
 * We need to use this to avoid importing RNGH 2 types and depending on it.
 * https://github.com/software-mansion/react-native-gesture-handler/blob/2.9.0/src/handlers/gestures/gesture.ts#L120
 * @hidden
 */
interface BaseGesture {
  handlers?: {
    onBegin?: (event: GestureEvent) => void;
  };
}

interface GestureTracingOptions {
  getCurrentHub: () => Hub;
}

/**
 * Patches React Native Gesture Handler v2 Gesture to start a transaction on gesture begin with the appropriate label.
 * Example: ShoppingCartScreen.dismissGesture
 */
export function traceGesture<GestureT>(
  /**
   * Label of the gesture to be used in transaction name.
   * Example: dismissGesture
   */
  label: string,
  gesture: GestureT,
  options: Partial<GestureTracingOptions> = {},
): GestureT {
  const gestureCandidate = gesture as BaseGesture | undefined | null;
  if (!gestureCandidate) {
    logger.warn('[ReactNativeTracing] Gesture can not be undefined');
    return gesture;
  }
  if (!gestureCandidate.handlers) {
    logger.warn('[ReactNativeTracing] Can not wrap gesture without handlers. If you want to wrap a gesture composition wrap individual gestures.');
    return gesture;
  }
  if (!label) {
    logger.warn('[ReactNativeTracing] Can not wrap gesture without name.');
    return gesture;
  }
  const currentHub = options.getCurrentHub?.() || getCurrentHub();

  const originalOnBegin = gestureCandidate.handlers.onBegin;
  (gesture as Required<BaseGesture>).handlers.onBegin = (event: GestureEvent) => {
    currentHub.getClient()?.getIntegration(ReactNativeTracing)
      ?.startUserInteractionTransaction({ elementId: label, op: ACTION_GESTURE_OP });

    if (originalOnBegin) {
      originalOnBegin(event);
    }
  };

  return gesture;
}
