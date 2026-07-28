import type { Breadcrumb, Scope } from '@sentry/core';

import { logger } from '@sentry/react';

import { DEFAULT_BREADCRUMB_LEVEL } from './breadcrumb';
import { fillTyped } from './utils/fill';
import { convertToNormalizedObject } from './utils/normalize';
import { NATIVE } from './wrapper';

/**
 * This WeakMap is used to keep track of which scopes have been synced to the native SDKs.
 * This ensures that we don't double sync the same scope.
 */
const syncedToNativeMap = new WeakMap<Scope, true>();

/**
 * Breadcrumbs whose sync to the native SDKs is owned by whoever marked them,
 * rather than by the scope patch below.
 */
const deferredNativeSyncBreadcrumbs = new WeakSet<Breadcrumb>();

/**
 * Normalize a breadcrumb the same way it is normalized before being added to the
 * scope, so the native SDKs always receive the same shape.
 */
function normalizeBreadcrumbForNative(breadcrumb: Breadcrumb): Breadcrumb {
  return {
    ...breadcrumb,
    level: breadcrumb.level || DEFAULT_BREADCRUMB_LEVEL,
    data: breadcrumb.data ? convertToNormalizedObject(breadcrumb.data) : undefined,
  };
}

/**
 * Mark a breadcrumb so that adding it to a synced scope does **not** forward it
 * to the native SDKs. The caller becomes responsible for calling
 * `syncBreadcrumbToNative` once its data is complete.
 *
 * This exists for breadcrumbs that carry data which can only be resolved
 * asynchronously (see the Mobile Replay network body capture): the breadcrumb
 * still reaches the JavaScript scope synchronously — so error events captured in
 * the meantime keep it — while the native SDKs, which cannot update a breadcrumb
 * after the fact, receive it once and already enriched.
 *
 * The mark is consumed by the first synced scope the breadcrumb is added to.
 */
export function deferBreadcrumbNativeSync(breadcrumb: Breadcrumb): void {
  deferredNativeSyncBreadcrumbs.add(breadcrumb);
}

/**
 * Forward a breadcrumb to the native SDKs without adding it to a scope. Used to
 * complete a `deferBreadcrumbNativeSync` handover.
 */
export function syncBreadcrumbToNative(breadcrumb: Breadcrumb): void {
  NATIVE.addBreadcrumb(normalizeBreadcrumbForNative(breadcrumb));
}

/**
 * Hooks into the scope set methods and sync new data added to the given scope with the native SDKs.
 */
export function enableSyncToNative(scope: Scope): void {
  if (syncedToNativeMap.has(scope)) {
    return;
  }
  syncedToNativeMap.set(scope, true);

  fillTyped(scope, 'setUser', original => (user): Scope => {
    NATIVE.setUser(user);
    return original.call(scope, user);
  });

  fillTyped(scope, 'setTag', original => (key, value): Scope => {
    NATIVE.setTag(key, NATIVE.primitiveProcessor(value));
    return original.call(scope, key, value);
  });

  fillTyped(scope, 'setTags', original => (tags): Scope => {
    // As native only has setTag, we just loop through each tag key.
    Object.keys(tags).forEach(key => {
      NATIVE.setTag(key, NATIVE.primitiveProcessor(tags[key]));
    });
    return original.call(scope, tags);
  });

  fillTyped(scope, 'setExtras', original => (extras): Scope => {
    Object.keys(extras).forEach(key => {
      NATIVE.setExtra(key, extras[key]);
    });
    return original.call(scope, extras);
  });

  fillTyped(scope, 'setExtra', original => (key, value): Scope => {
    NATIVE.setExtra(key, value);
    return original.call(scope, key, value);
  });

  fillTyped(scope, 'addBreadcrumb', original => (breadcrumb, maxBreadcrumbs): Scope => {
    // Consume the mark before normalizing — the normalized copy is a different object.
    const nativeSyncDeferred = deferredNativeSyncBreadcrumbs.delete(breadcrumb);
    const mergedBreadcrumb = normalizeBreadcrumbForNative(breadcrumb);

    original.call(scope, mergedBreadcrumb, maxBreadcrumbs);

    if (nativeSyncDeferred) {
      // Whoever deferred the sync forwards this breadcrumb to native itself,
      // once the data it is waiting for has resolved.
      return scope;
    }

    const finalBreadcrumb = scope.getLastBreadcrumb();
    if (finalBreadcrumb) {
      NATIVE.addBreadcrumb(finalBreadcrumb);
    } else {
      logger.warn('[ScopeSync] Last created breadcrumb is undefined. Skipping sync to native.');
    }

    return scope;
  });

  fillTyped(scope, 'clearBreadcrumbs', original => (): Scope => {
    NATIVE.clearBreadcrumbs();
    return original.call(scope);
  });

  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  fillTyped(scope, 'setContext', original => (key: string, context: { [key: string]: any } | null): Scope => {
    NATIVE.setContext(key, context);
    return original.call(scope, key, context);
  });

  fillTyped(scope, 'setAttribute', original => (key: string, value: unknown): Scope => {
    // Only sync primitive types
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      NATIVE.setAttribute(key, value);
    }
    return original.call(scope, key, value);
  });

  fillTyped(scope, 'setAttributes', original => (attributes: Record<string, unknown>): Scope => {
    // Filter to only primitive types
    const primitiveAttrs: Record<string, string | number | boolean> = {};
    Object.keys(attributes).forEach(key => {
      const value = attributes[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        primitiveAttrs[key] = value;
      }
    });

    if (Object.keys(primitiveAttrs).length > 0) {
      NATIVE.setAttributes(primitiveAttrs);
    }
    return original.call(scope, attributes);
  });

  fillTyped(scope, 'removeAttribute', original => (key: string): Scope => {
    NATIVE.removeAttribute(key);
    return original.call(scope, key);
  });
}
