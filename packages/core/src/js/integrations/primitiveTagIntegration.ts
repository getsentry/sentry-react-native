import type { Integration, Primitive } from '@sentry/core';
import { PrimitiveToString } from '../utils/primitiveConverter';
import { NATIVE } from '../wrapper';

export const INTEGRATION_NAME = 'PrimitiveTagIntegration';

/**
 * Format tags set with Primitive values with a standard string format.
 *
 * When this Integration is enable, the following types will have the following behaviour:
 *
 * Unaltered: string, null, number, and undefined values remain unchanged.
 *
 * Altered:
 *  Boolean values are now capitalized: true -> True, false -> False.
 *  Symbols are stringified.
 *
 */
export const primtiviteTagIntegration = (): Integration =>
{
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      client.on('beforeSendEvent', (event) => {
        if (event.tags) {
          Object.keys(event.tags).forEach(key => {
            event.tags![key] = PrimitiveToString(event.tags![key]);
          });
        }
      })
    },
    afterAllSetup() {
      if (NATIVE.enableNative) {
        NATIVE._setPrimitiveProcessor((value: Primitive) => PrimitiveToString(value));
      }
    }
  };
};
