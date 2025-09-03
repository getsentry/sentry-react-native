import { notWeb } from './environment';
import { RN_GLOBAL_OBJ } from './worldwide';

/**
 *
 */
export function createReleaseFromGlobalReleaseConstants(): string | undefined {
  const globalRelease = RN_GLOBAL_OBJ.SENTRY_RELEASE;
  if (!globalRelease) {
    return undefined;
  }

  const { name, version } = globalRelease;
  if (!name || !version) {
    return undefined;
  }

  return `${name}@${version}`;
}

/**
 *
 */
export function getDefaultRelease(): string | undefined {
  if (notWeb()) {
    // Mobile platforms use native release from the Release integration.
    return undefined;
  }

  // Web platforms (Expo Web) use the global release constants.
  // Release set in the options is need for Session and Replay integrations.
  return createReleaseFromGlobalReleaseConstants();
}
