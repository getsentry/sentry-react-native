/* oxlint-disable eslint(complexity) */
import type { Breadcrumb, Client, Event, EventHint, Integration } from '@sentry/core';

import { debug, severityLevelFromString } from '@sentry/core';
import { AppState } from 'react-native';

import type { NativeDeviceContextsResponse } from '../NativeRNSentry';

import { breadcrumbFromObject } from '../breadcrumb';
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
    debug.log(`Failed to get device context from native: ${e}`);
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
    const dedupedNativeBreadcrumbs = deduplicateNativeHttpBreadcrumbs(nativeBreadcrumbs, event.breadcrumbs || []);
    event.breadcrumbs = dedupedNativeBreadcrumbs
      .concat(event.breadcrumbs || [])
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
      .slice(-maxBreadcrumbs);
  }

  return event;
}

const HTTP_BREADCRUMB_DEDUP_TIMESTAMP_TOLERANCE_SECONDS = 2;

/**
 * Removes native HTTP breadcrumbs that are duplicates of JS XHR/fetch breadcrumbs.
 *
 * React Native's networking (fetch/XHR) is implemented via native APIs (NSURLSession on iOS,
 * OkHttp on Android). Both the JS SDK and the native SDK instrument these requests independently,
 * resulting in duplicate breadcrumbs: a JS "xhr" breadcrumb and a native "http" breadcrumb
 * for the same request.
 *
 * Each JS breadcrumb can only consume one native match to avoid false positives
 * when there are legitimate consecutive identical requests.
 */
function deduplicateNativeHttpBreadcrumbs(nativeBreadcrumbs: Breadcrumb[], jsBreadcrumbs: Breadcrumb[]): Breadcrumb[] {
  const jsHttpBreadcrumbs = jsBreadcrumbs.filter(
    b => b.type === 'http' && (b.category === 'xhr' || b.category === 'fetch'),
  );

  if (jsHttpBreadcrumbs.length === 0) {
    return nativeBreadcrumbs;
  }

  const consumedJsIndices = new Set<number>();

  return nativeBreadcrumbs.filter(nativeBreadcrumb => {
    if (nativeBreadcrumb.type !== 'http' || nativeBreadcrumb.category !== 'http') {
      return true;
    }

    const matchIndex = jsHttpBreadcrumbs.findIndex((jsBreadcrumb, index) => {
      if (consumedJsIndices.has(index)) {
        return false;
      }

      const sameMethod = nativeBreadcrumb.data?.method === jsBreadcrumb.data?.method;
      const sameUrl = nativeBreadcrumb.data?.url === jsBreadcrumb.data?.url;
      const nativeStatus = nativeBreadcrumb.data?.status_code;
      const jsStatus = jsBreadcrumb.data?.status_code;
      const sameStatus =
        nativeStatus == null && jsStatus == null
          ? true
          : nativeStatus != null && jsStatus != null && Number(nativeStatus) === Number(jsStatus);
      const withinTimeTolerance =
        nativeBreadcrumb.timestamp != null &&
        jsBreadcrumb.timestamp != null &&
        Math.abs(nativeBreadcrumb.timestamp - jsBreadcrumb.timestamp) <=
          HTTP_BREADCRUMB_DEDUP_TIMESTAMP_TOLERANCE_SECONDS;

      return sameMethod && sameUrl && sameStatus && withinTimeTolerance;
    });

    if (matchIndex !== -1) {
      consumedJsIndices.add(matchIndex);
      return false;
    }

    return true;
  });
}
