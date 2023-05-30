import type { InternalGlobal } from '@sentry/utils';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { ErrorUtils } from 'react-native/types';

/** Internal Global object interface with common and Sentry specific properties */
export interface ReactNativeInternalGlobal extends InternalGlobal {
  __sentry_rn_v4_registered?: boolean;
  __sentry_rn_v5_registered?: boolean;
  HermesInternal?: {
    getRuntimeProperties?: () => Record<string, string | undefined>;
  };
  Promise: unknown;
  __turboModuleProxy: unknown;
  nativeFabricUIManager: unknown;
  ErrorUtils?: ErrorUtils;
  expo: unknown;
}

/** Get's the global object for the current JavaScript runtime */
export const RN_GLOBAL_OBJ = GLOBAL_OBJ as ReactNativeInternalGlobal;
