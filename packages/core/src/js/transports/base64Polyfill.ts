import { getSentryCarrier } from '../utils/carrier';
import { base64StringFromByteArray } from '../vendor';

export const useBase64Polyfill = (): void => {
  const carrier = getSentryCarrier();
  carrier.base64Polyfill = base64Polyfill;
};

/*
 * The default base64 polyfill runs in JS and might cause performance issues
 * when processing large payloads (~2+ MB, e.g. profiles, attachments, replays).
 *
 * A future change can replace this with a native (JSI/TurboModule) encoder via
 * the same carrier hook without touching call sites.
 */
export const base64Polyfill = (bytes: Uint8Array | number[]): string => {
  return base64StringFromByteArray(bytes);
};
