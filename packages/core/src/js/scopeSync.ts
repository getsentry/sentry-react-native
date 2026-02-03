import type { Breadcrumb, Scope } from '@sentry/core';
import { debug } from '@sentry/core';
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
    const mergedBreadcrumb: Breadcrumb = {
      ...breadcrumb,
      level: breadcrumb.level || DEFAULT_BREADCRUMB_LEVEL,
      data: breadcrumb.data ? convertToNormalizedObject(breadcrumb.data) : undefined,
    };

    original.call(scope, mergedBreadcrumb, maxBreadcrumbs);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fillTyped(scope, 'setContext', original => (key: string, context: { [key: string]: any } | null): Scope => {
    NATIVE.setContext(key, context);
    return original.call(scope, key, context);
  });

  fillTyped(scope, 'setAttribute', original => (key: string, value: unknown): Scope => {
    debug.warn('This feature is currently not supported.');
    // Only sync primitive types
    // Native  layer still not supported
    // if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    //  NATIVE.setAttribute(key, value);
    // }
    return original.call(scope, key, value);
  });

  fillTyped(scope, 'setAttributes', original => (attributes: Record<string, unknown>): Scope => {
    // Native layer not supported
    debug.warn('This feature is currently not supported.');
    // Filter to only primitive types
    // const primitiveAttrs: Record<string, string | number | boolean> = {};
    // Object.keys(attributes).forEach(key => {
    //  const value = attributes[key];
    //  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    //    primitiveAttrs[key] = value;
    //  }
    // });
    //
    // if (Object.keys(primitiveAttrs).length > 0) {
    //  NATIVE.setAttributes(primitiveAttrs);
    // }
    return original.call(scope, attributes);
  });
}
