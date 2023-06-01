import { makeProfilingCache } from '@sentry/utils';

import type { RawThreadCpuProfile } from './types';

export const PROFILE_QUEUE = makeProfilingCache<string, RawThreadCpuProfile>(20);
