import type { Breadcrumb } from '@sentry/core';
import { addBreadcrumb, logger, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';

import { startUserInteractionSpan } from './integrations/userInteraction';
import { UI_ACTION } from './ops';
import { SPAN_ORIGIN_AUTO_INTERACTION } from './origin';

export const DEFAULT_BREADCRUMB_CATEGORY = 'gesture';
export const DEFAULT_BREADCRUMB_TYPE = 'user';

export const GESTURE_POSTFIX_LENGTH = 'GestureHandler'.length;
export const ACTION_GESTURE_FALLBACK = 'gesture';

/**
 * Internal interface following RNGH 2 Gesture Event API.
 * We need to use this to avoid importing RNGH 2 types and depending on it.
 * https://github.com/software-mansion/react-native-gesture-handler/blob/f0868f7ccf678c947ef65519ebf97ae149a10289/src/handlers/gestures/gesture.ts#L55
 * @hidden
 */
type GestureEvent = Record<string, unknown>;

/**
 * Internal interface for RNGH 2 Gesture API.
 * We need to use this to avoid importing RNGH 2 types and depending on it.
 * https://github.com/software-mansion/react-native-gesture-handler/blob/2.9.0/src/handlers/gestures/gesture.ts#L120
 * @hidden
 */
interface BaseGesture {
  handlers?: {
    onBegin?: (event: GestureEvent) => void;
    onEnd?: (event: GestureEvent) => void;
  };
  handlerName: string;
}

/**
 * Patches React Native Gesture Handler v2 Gesture to start a transaction on gesture begin with the appropriate label.
 * Example: ShoppingCartScreen.dismissGesture
 */
export function sentryTraceGesture<GestureT>(
  /**
   * Label of the gesture to be used in transaction name.
   * Example: dismissGesture
   */
  label: string,
  gesture: GestureT,
): GestureT {
  const gestureCandidate = gesture as unknown as BaseGesture | undefined | null;
  if (!gestureCandidate) {
    logger.warn('[GestureTracing] Gesture can not be undefined');
    return gesture;
  }
  if (!gestureCandidate.handlers) {
    logger.warn(
      '[GestureTracing] Can not wrap gesture without handlers. If you want to wrap a gesture composition wrap individual gestures.',
    );
    return gesture;
  }
  if (!label) {
    logger.warn('[GestureTracing] Can not wrap gesture without name.');
    return gesture;
  }
  const name =
    gestureCandidate.handlerName.length > GESTURE_POSTFIX_LENGTH
      ? gestureCandidate.handlerName
          .substring(0, gestureCandidate.handlerName.length - GESTURE_POSTFIX_LENGTH)
          .toLowerCase()
      : ACTION_GESTURE_FALLBACK;

  const originalOnBegin = gestureCandidate.handlers.onBegin;
  (gesture as unknown as Required<BaseGesture>).handlers.onBegin = (event: GestureEvent) => {
    const span = startUserInteractionSpan({ elementId: label, op: `${UI_ACTION}.${name}` });
    if (span) {
      span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SPAN_ORIGIN_AUTO_INTERACTION);
    }

    addGestureBreadcrumb(`Gesture ${label} begin.`, { event, name });

    if (originalOnBegin) {
      originalOnBegin(event);
    }
  };

  const originalOnEnd = gestureCandidate.handlers.onEnd;
  (gesture as unknown as Required<BaseGesture>).handlers.onEnd = (event: GestureEvent) => {
    addGestureBreadcrumb(`Gesture ${label} end.`, { event, name });

    if (originalOnEnd) {
      originalOnEnd(event);
    }
  };

  return gesture;
}

function addGestureBreadcrumb(
  message: string,
  options: {
    event: Record<string, unknown> | undefined | null;
    name: string;
  },
): void {
  const { event, name } = options;
  const crumb: Breadcrumb = {
    message,
    level: 'info',
    type: DEFAULT_BREADCRUMB_TYPE,
    category: DEFAULT_BREADCRUMB_CATEGORY,
  };

  if (event) {
    const data: Record<string, unknown> = {
      gesture: name,
    };
    for (const key of Object.keys(GestureEventKeys)) {
      const eventKey = GestureEventKeys[key as keyof typeof GestureEventKeys];
      if (eventKey in event) {
        data[eventKey] = event[eventKey];
      }
    }
    crumb.data = data;
  }

  addBreadcrumb(crumb);

  logger.log(`[GestureTracing] ${crumb.message}`);
}

/**
 * Selected keys from RNGH 2 Gesture Event API.
 * We only want to send relevant data to save on payload size.
 * @hidden
 */
const GestureEventKeys = {
  NUMBER_OF_POINTERS: 'numberOfPointers',
  NUMBER_OF_TOUCHES: 'numberOfTouches',
  FORCE: 'force',
  FORCE_CHANGE: 'forceChange',
  ROTATION: 'rotation',
  ROTATION_CHANGE: 'rotationChange',
  SCALE: 'scale',
  SCALE_CHANGE: 'scaleChange',
  DURATION: 'duration',
  VELOCITY: 'velocity',
  VELOCITY_X: 'velocityX',
  VELOCITY_Y: 'velocityY',
} as const;
