/**
 * Global type augmentations for the Sentry React Native SDK
 *
 * This file contains global type fixes and augmentations to resolve conflicts
 * with transitive dependencies.
 */

/**
 * Fix for Object.freeze type pollution from @sentry-internal/replay
 *
 * Issue: TypeScript incorrectly resolves Object.freeze() to a freeze method
 * from @sentry-internal/replay's CanvasManagerInterface instead of the built-in.
 *
 * See: https://github.com/getsentry/sentry-react-native/issues/5407
 */
declare global {
  interface ObjectConstructor {
    freeze<T>(o: T): Readonly<T>;

    // eslint-disable-next-line @typescript-eslint/ban-types -- Matching TypeScript's official Object.freeze signature from lib.es5.d.ts
    freeze<T extends Function>(f: T): T;

    freeze<T extends {[idx: string]: U | null | undefined | object}, U extends string | bigint | number | boolean | symbol>(o: T): Readonly<T>;

    freeze<T>(o: T): Readonly<T>;
  }
}

export {};

