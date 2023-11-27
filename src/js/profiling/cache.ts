import { makeFifoCache } from '@sentry/utils';

import type { CombinedProfileEvent } from './types';

export const PROFILE_QUEUE = makeFifoCache<string, CombinedProfileEvent>(20);
