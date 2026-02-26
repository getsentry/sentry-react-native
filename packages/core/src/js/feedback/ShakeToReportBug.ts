import { debug } from '@sentry/core';
import type { EmitterSubscription, NativeModule } from 'react-native';
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
export function startShakeListener(onShake: () => void, createEmitter: EmitterFactory = defaultEmitterFactory): void {
  if (_shakeSubscription) {
    debug.log('Shake listener is already active.');
    return;
  }

  if (isWeb()) {
    debug.warn('Shake detection is not supported on Web.');
    return;
  }

  const nativeModule = getRNSentryModule() as NativeModule | undefined;
  if (!nativeModule) {
    debug.warn('Native module is not available. Shake detection will not work.');
    return;
  }

  const emitter = createEmitter(nativeModule);
  _shakeSubscription = emitter.addListener(OnShakeEventName, () => {
    debug.log('Shake detected.');
    onShake();
  });
}

/**
 * Stops listening for device shake events.
 */
export function stopShakeListener(): void {
  if (_shakeSubscription) {
    _shakeSubscription.remove();
    _shakeSubscription = null;
  }
}

/**
 * Returns whether the shake listener is currently active.
 * Exported for testing purposes.
 */
export function isShakeListenerActive(): boolean {
  return _shakeSubscription !== null;
}
