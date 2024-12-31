/* eslint-disable complexity */
import type { Client, Event, EventHint, Integration } from '@sentry/core';
import { logger, severityLevelFromString } from '@sentry/core';
import { AppState } from 'react-native';

import { breadcrumbFromObject } from '../breadcrumb';
import type { NativeDeviceContextsResponse } from '../NativeRNSentry';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'DeviceContext';

/** Load device context from native. */
export const deviceContextIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      /* noop */
    },
    processEvent,
  };
};

async function processEvent(event: Event, _hint: EventHint, client: Client): Promise<Event> {
  let native: NativeDeviceContextsResponse | null = null;
  try {
    native = await NATIVE.fetchNativeDeviceContexts();
  } catch (e) {
    logger.log(`Failed to get device context from native: ${e}`);
  }

  if (!native) {
    return event;
  }

  const nativeUser = native.user;
  if (!event.user && nativeUser) {
    event.user = nativeUser;
  }

  let nativeContexts = native.contexts;
  if (AppState.currentState !== 'unknown') {
    nativeContexts = nativeContexts || {};
    nativeContexts.app = {
      ...nativeContexts.app,
      in_foreground: AppState.currentState === 'active',
    };
  }
  if (nativeContexts) {
    event.contexts = { ...nativeContexts, ...event.contexts };
    if (nativeContexts.app) {
      event.contexts.app = { ...nativeContexts.app, ...event.contexts.app };
    }
  }

  const nativeTags = native.tags;
  if (nativeTags) {
    event.tags = { ...nativeTags, ...event.tags };
  }

  const nativeExtra = native.extra;
  if (nativeExtra) {
    event.extra = { ...nativeExtra, ...event.extra };
  }

  const nativeFingerprint = native.fingerprint;
  if (nativeFingerprint) {
    event.fingerprint = (event.fingerprint ?? []).concat(
      nativeFingerprint.filter(item => (event.fingerprint ?? []).indexOf(item) < 0),
    );
  }

  const nativeLevel = typeof native['level'] === 'string' ? severityLevelFromString(native['level']) : undefined;
  if (!event.level && nativeLevel) {
    event.level = nativeLevel;
  }

  const nativeEnvironment = native['environment'];
  if (!event.environment && nativeEnvironment) {
    event.environment = nativeEnvironment;
  }

  const nativeBreadcrumbs = Array.isArray(native['breadcrumbs'])
    ? native['breadcrumbs'].map(breadcrumbFromObject)
    : undefined;
  if (nativeBreadcrumbs) {
    const maxBreadcrumbs = client?.getOptions().maxBreadcrumbs ?? 100; // Default is 100.
    event.breadcrumbs = nativeBreadcrumbs
      .concat(event.breadcrumbs || []) // concatenate the native and js breadcrumbs
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)) // sort by timestamp
      .slice(-maxBreadcrumbs); // keep the last maxBreadcrumbs
  }

  return event;
}
