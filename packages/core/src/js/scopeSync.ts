import type { Breadcrumb, Scope } from '@sentry/core';

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
    NATIVE.setTag(key, value as string);
    return original.call(scope, key, value);
  });

  fillTyped(scope, 'setTags', original => (tags): Scope => {
    // As native only has setTag, we just loop through each tag key.
    Object.keys(tags).forEach(key => {
      NATIVE.setTag(key, tags[key] as string);
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
    NATIVE.addBreadcrumb(finalBreadcrumb);

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
}
