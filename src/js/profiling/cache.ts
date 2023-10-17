import type { Profile } from '@sentry/types';
import { makeFifoCache } from '@sentry/utils';

export const PROFILE_QUEUE = makeFifoCache<string, Partial<Profile>>(20);
