import type { InternalGlobal } from '@sentry/utils';
import { GLOBAL_OBJ } from '@sentry/utils';
import type { ErrorUtils } from 'react-native/types';

import type { ExpoGlobalObject } from './expoglobalobject';

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
  expo?: ExpoGlobalObject;
  XMLHttpRequest?: typeof XMLHttpRequest;
  process?: {
    env?: {
      ___SENTRY_METRO_DEV_SERVER___?: string;
    };
  };
  __BUNDLE_START_TIME__?: number;
  nativePerformanceNow?: () => number;
  TextEncoder?: TextEncoder;
}

type TextEncoder = {
  new (): TextEncoder;
  encode(input?: string): Uint8Array;
};

/** Get's the global object for the current JavaScript runtime */
export const RN_GLOBAL_OBJ = GLOBAL_OBJ as ReactNativeInternalGlobal;
