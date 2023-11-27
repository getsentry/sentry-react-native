import type { DebugImage } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { DEFAULT_BUNDLE_NAME } from './hermes';

/**
 * Returns debug meta images of the loaded bundle.
 */
export function getDebugMetadata(): DebugImage[] {
  if (!DEFAULT_BUNDLE_NAME) {
    return [];
  }

  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;
  if (!debugIdMap) {
    return [];
  }

  const debugIdsKeys = Object.keys(debugIdMap);
  if (!debugIdsKeys.length) {
    return [];
  }

  if (debugIdsKeys.length > 1) {
    logger.warn(
      '[Profiling] Multiple debug images found, but only one one bundle is supported. Using the first one...',
    );
  }

  return [
    {
      code_file: DEFAULT_BUNDLE_NAME,
      debug_id: debugIdMap[debugIdsKeys[0]],
      type: 'sourcemap',
    },
  ];
}
