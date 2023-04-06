import type { TextEncoderInternal } from '@sentry/types';

import { utf8ToBytes } from '../vendor';

export const makeUtf8TextEncoder = (): TextEncoderInternal => {
  const textEncoder = {
    encode: (text: string) => {
      const bytes = new Uint8Array(utf8ToBytes(text));
      return bytes;
    },
    encoding: 'utf-8',
  };
  return textEncoder;
};
