import type { Client, Event, EventHint, Integration } from '@sentry/core';

import { debug, parseStackFrames } from '@sentry/core';
import { Platform } from 'react-native';

import { notWeb } from '../utils/environment';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'NativeStackRecovery';

/**
 * Recovers missing JS stack traces from the native JavascriptException cache.
 *
 * On Android, when a React render error occurs with Hermes, the JS error may arrive
 * at the global error handler without a stack trace. However, the same error is caught
 * by React Native's native layer as a JavascriptException which contains the full
 * JS stack trace. This integration fetches that cached stack and attaches it to the event.
 */
export const nativeStackRecoveryIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      /* noop */
    },
    preprocessEvent: (event: Event, hint: EventHint, client: Client): void =>
      preprocessEvent(event, hint, client),
  };
};

function isEnabled(): boolean {
  return notWeb() && NATIVE.enableNative && Platform.OS === 'android';
}

function preprocessEvent(event: Event, _hint: EventHint, client: Client): void {
  if (!isEnabled()) {
    return;
  }

  const primaryException = event.exception?.values?.[0];
  if (!primaryException) {
    return;
  }

  if (primaryException.stacktrace?.frames && primaryException.stacktrace.frames.length > 0) {
    return;
  }

  const cachedStack = NATIVE.fetchCachedJavascriptExceptionStack();
  if (!cachedStack) {
    return;
  }

  const parser = client.getOptions().stackParser;
  const syntheticError = new Error();
  syntheticError.stack = cachedStack;

  const frames = parseStackFrames(parser, syntheticError);
  if (frames.length > 0) {
    primaryException.stacktrace = { frames };
    debug.log(`[${INTEGRATION_NAME}] Recovered ${frames.length} frames from native JavascriptException cache`);
  }
}
