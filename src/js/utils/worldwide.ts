import { GLOBAL_OBJ, InternalGlobal } from '@sentry/utils';

/** Internal Global object interface with common and Sentry specific properties */
export interface ReactNativeInternalGlobal extends InternalGlobal {
  __sentry_rn_v4_registered?: boolean;
  __sentry_rn_v5_registered?: boolean;
  HermesInternal: unknown;
  Promise: unknown;
}

/** Get's the global object for the current JavaScript runtime */
export const RN_GLOBAL_OBJ = GLOBAL_OBJ as ReactNativeInternalGlobal;
