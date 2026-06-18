import { getMainCarrier, SDK_VERSION as CORE_SDK_VERSION } from '@sentry/core';

/*
 * Will either get the existing sentry carrier, or create a new one.
 * Based on https://github.com/getsentry/sentry-javascript/blob/f0fc41f6166857cd97a695f5cc9a18caf6a0bf43/packages/core/src/carrier.ts#L49
 */
export const getSentryCarrier = (): ReactNativeSentryCarrier => {
  const carrier = getMainCarrier();
  const __SENTRY__ = (carrier.__SENTRY__ = carrier.__SENTRY__ || {});
  return (__SENTRY__[CORE_SDK_VERSION] = __SENTRY__[CORE_SDK_VERSION] || {});
};

type SentryCarrier = Required<ReturnType<typeof getMainCarrier>>['__SENTRY__'][string];

/**
 * React Native specific carrier extensions that are not present in `@sentry/core`.
 */
type ReactNativeSentryCarrier = SentryCarrier & {
  /** Overrides the base64 encoder used when shipping envelopes to the native layer. */
  base64Polyfill?: (input: Uint8Array | number[]) => string;
};
