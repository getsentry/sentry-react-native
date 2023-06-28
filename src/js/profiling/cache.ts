import { makeFifoCache } from '@sentry/utils';

import type { RawThreadCpuProfile } from './types';

export const PROFILE_QUEUE = makeFifoCache<string, RawThreadCpuProfile>(20);
