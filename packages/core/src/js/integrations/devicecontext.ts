/* eslint-disable complexity */
import { getClient } from '@sentry/core';
import type { Breadcrumb, Event, Integration } from '@sentry/types';
import { logger, severityLevelFromString } from '@sentry/utils';
import { AppState } from 'react-native';

import { breadcrumbFromObject } from '../breadcrumb';
import type { NativeDeviceContextsResponse } from '../NativeRNSentry';
import { NATIVE } from '../wrapper';
import { getDevServer } from './debugsymbolicatorutils';

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

async function processEvent(event: Event): Promise<Event> {
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
    // Concatenate nativeBreadcrumbs first, then event.breadcrumbs
    event.breadcrumbs = nativeBreadcrumbs.concat(event.breadcrumbs || []);
  }

  const options = getClient()?.getOptions();
  const maxBreadcrumbs = options.maxBreadcrumbs ?? 100; // Default is 100.
  const devServerUrl = getDevServer()?.url || '';
  const dsn = options.dsn || '';

  let allBreadcrumbs = event.breadcrumbs || [];

  // Filter out Dev Server and Sentry DSN request breadcrumbs
  allBreadcrumbs = allBreadcrumbs.filter((breadcrumb: Breadcrumb) => {
    const type = breadcrumb.type || '';
    const url = breadcrumb.data?.url || '';
    return !(type === 'http' && (url.includes(devServerUrl) || url.includes(dsn)));
  });

  // Ensure the maxBreadcrumbs limit is not exceeded after merging event and native breadcrumbs
  // and filtering out Dev Server and Sentry DSN request breadcrumbs
  event.breadcrumbs = allBreadcrumbs.slice(0, maxBreadcrumbs);

  return event;
}
