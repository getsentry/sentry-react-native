import type { EmitterSubscription, NativeModule } from 'react-native';

import { debug } from '@sentry/core';
import { NativeEventEmitter } from 'react-native';

import { isWeb } from '../utils/environment';
import { getRNSentryModule } from '../wrapper';

export const OnShakeEventName = 'rn_sentry_on_shake';

let _shakeSubscription: EmitterSubscription | null = null;

/**
 * Creates a NativeEventEmitter for the given module.
 * Can be overridden in tests via the `createEmitter` parameter.
 */
type EmitterFactory = (nativeModule: NativeModule) => NativeEventEmitter;

const defaultEmitterFactory: EmitterFactory = nativeModule => new NativeEventEmitter(nativeModule);

/**
 * Starts listening for device shake events and invokes the provided callback when a shake is detected.
 *
 * This starts native shake detection:
 * - iOS: Uses UIKit's motion event detection (no permissions required)
 * - Android: Uses the accelerometer sensor (no permissions required)
 */
export function startShakeListener(
  onShake: () => void,
  createEmitter: EmitterFactory = defaultEmitterFactory,
): boolean {
  if (_shakeSubscription) {
    return false;
  }

  if (isWeb()) {
    debug.warn('Shake detection is not supported on Web.');
    return false;
  }

  const nativeModule = getRNSentryModule() as NativeModule | undefined;
  if (!nativeModule) {
    debug.warn('Native module is not available. Shake detection will not work.');
    return false;
  }

  try {
    const emitter = createEmitter(nativeModule);
    _shakeSubscription = emitter.addListener(OnShakeEventName, () => {
      onShake();
    });

    // Explicitly enable native shake detection. On iOS with New Architecture (TurboModules),
    // NativeEventEmitter.addListener does not dispatch to native addListener:, so the
    // native shake listener would never start without this explicit call.
    const module = nativeModule as { enableShakeDetection?: () => void };
    if (module.enableShakeDetection) {
      module.enableShakeDetection();
    } else {
      debug.warn('enableShakeDetection is not available on the native module.');
    }
    return true;
  } catch (e) {
    debug.warn('Failed to start shake listener:', e);
    if (_shakeSubscription) {
      _shakeSubscription.remove();
      _shakeSubscription = null;
    }
    return false;
  }
}

/**
 * Stops listening for device shake events.
 */
export function stopShakeListener(): void {
  if (_shakeSubscription) {
    try {
      _shakeSubscription.remove();
    } catch (e) {
      debug.warn('Failed to remove shake subscription:', e);
    }
    _shakeSubscription = null;

    try {
      const nativeModule = getRNSentryModule() as { disableShakeDetection?: () => void } | undefined;
      nativeModule?.disableShakeDetection?.();
    } catch (e) {
      debug.warn('Failed to disable native shake detection:', e);
    }
  }
}

/**
 * Returns whether the shake listener is currently active.
 * Exported for testing purposes.
 */
export function isShakeListenerActive(): boolean {
  return _shakeSubscription !== null;
}
