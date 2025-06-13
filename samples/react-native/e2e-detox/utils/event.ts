import { Envelope, EnvelopeItem } from '@sentry/core';
import { HEADER, ITEMS } from './consts';

export function getItemOfTypeFrom<T extends EnvelopeItem>(
  envelope: Envelope,
  type: string,
): T | undefined {
  return (envelope[ITEMS] as [{ type?: string }, unknown][]).find(
    i => i[HEADER].type === type,
  ) as T | undefined;
}
