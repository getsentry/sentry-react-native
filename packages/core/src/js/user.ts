import type { User } from '@sentry/core';

/** Requires all the keys defined on User interface to be present on an object */
export type RequiredKeysUser = { [P in keyof Required<User>]: User[P] | undefined };
