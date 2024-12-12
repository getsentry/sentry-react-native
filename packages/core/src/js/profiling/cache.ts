import { makeFifoCache } from '@sentry/core';

import type { AndroidCombinedProfileEvent, CombinedProfileEvent } from './types';

export const PROFILE_QUEUE = makeFifoCache<string, CombinedProfileEvent | AndroidCombinedProfileEvent>(20);
