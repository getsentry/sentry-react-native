import { TextEncoderInternal } from '@sentry/types';
import { Buffer } from 'buffer';

export const makeUtf8TextEncoder = (): TextEncoderInternal => {
  const textEncoder = {
    encode: (text: string) => {
      const bytes = new Uint8Array(Buffer.from(text, 'utf8'));
      return bytes;
    },
    encoding: 'utf-8',
  };
  return textEncoder;
}
