import { makeFetchTransport } from '@sentry/browser';
import { FetchImpl } from '@sentry/browser/types/transports/utils';
import { Transport } from '@sentry/types';

import { NATIVE } from '../wrapper';
import { makeReactNativeTransport } from './native';
import { ReactNativeTransportOptions } from '../options';

/**
 * Creates native transport if available.
 * Fallbacks to fetch transport otherwise.
 */
export function makeTransport(options: ReactNativeTransportOptions, nativeFetch?: FetchImpl): Transport {
  if (NATIVE.isNativeTransportAvailable()) {
    return makeReactNativeTransport(options);
  }
  return makeFetchTransport(options, nativeFetch);
}
