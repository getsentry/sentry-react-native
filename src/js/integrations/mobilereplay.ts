import { getClient } from '@sentry/core';
import type { Event, IntegrationFn, IntegrationFnResult } from '@sentry/types';
import { logger } from '@sentry/utils';

import { ReactNativeClient } from '../client';
import { isExpoGo, notMobileOs } from '../utils/environment';
import { NATIVE } from '../wrapper';

const NAME = 'MobileReplay';

/**
 * MobileReplay Integration let's you change default options.
 */
export const mobileReplay: IntegrationFn = () => {
  if (isExpoGo()) {
    logger.warn(`[Sentry] ${NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`);
  }
  if (notMobileOs()) {
    logger.warn(`[Sentry] ${NAME} is not supported on this platform.`);
  }

  if (isExpoGo() || notMobileOs()) {
    return mobileReplayNoop();
  }

  return {
    name: NAME,
    setupOnce() { /* Noop */ },
    processEvent,
  };
};

/**
 * Capture a replay of the last user interaction before crash.
 */
export const captureReplayOnCrash = (): string | null => {
  if (isExpoGo()) {
    logger.warn(`[Sentry] ${NAME} is not supported in Expo Go. Use EAS Build or \`expo prebuild\` to enable it.`);
    return null;
  }
  if (notMobileOs()) {
    logger.warn(`[Sentry] ${NAME} is not supported on this platform.`);
    return null;
  }

  const client = getClient();
  if (!client) {
    logger.warn(`[Sentry] ${NAME} no client available.`);
    return null;
  }

  if (!(client instanceof ReactNativeClient)) {
    logger.warn(`[Sentry] ${NAME} supports only React Native clients.`);
    return null;
  }

  const replaySampleRate = client.getOptions().replaysOnErrorSampleRate;
  if (!replaySampleRate) {
    logger.debug(`[Sentry] ${NAME} disabled for this client.`);
    return null;
  }

  return NATIVE.captureReplayOnCrash();
};

async function processEvent(event: Event): Promise<Event> {
  if (!event.exception) {
    return event;
  }

  const replayExists = false;
  if (replayExists /* TODO: Check if replay already exists */) {
    return event;
  }

  const replayId = await NATIVE.captureReplay();
  if (!replayId) {
    logger.debug(`[Sentry] ${NAME} not sampled for event, ${event.event_id}.`);
  }

  addReplayToEvent(event, replayId);
  // TODO: Add replayId to DSC
  return event;
}

/**
 * Attach a replay to the event.
 */
export const addReplayToEvent = (_event: Event, _replayId: string | null): void => {
  // TODO: Add replayId to the current event
}

function mobileReplayNoop(): IntegrationFnResult {
  return {
    name: NAME,
    setupOnce() { /* Noop */ },
  };
}
