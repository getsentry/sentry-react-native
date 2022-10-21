import { GLOBAL_OBJ, InternalGlobal } from '@sentry/utils';

export interface ReactNativeInternalGlobal extends InternalGlobal {
  __sentry_rn_v4_registered?: boolean;
  __sentry_rn_v5_registered?: boolean;
  HermesInternal: unknown;
  Promise: unknown;
}

export const RN_GLOBAL_OBJ = GLOBAL_OBJ as ReactNativeInternalGlobal;
