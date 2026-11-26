import * as Sentry from '@sentry/react-native';
import { LaunchArguments } from 'react-native-launch-arguments';

interface VerifyRunArgs {
  verifyPr?: string;
  verifyCommit?: string;
  verifyRunId?: string;
}

/**
 * Tags every event with the verification run passed as launch arguments, so
 * the `verify-pr` skill can find its events in Sentry. No-op without them.
 *
 * Android: `adb shell am start -n <app>/.MainActivity -e verifyRunId <id>`
 * Maestro: `launchApp: { arguments: { verifyRunId: <id> } }`
 */
export function tagVerifyRun(): void {
  const args = LaunchArguments.value<VerifyRunArgs>();
  const tags: Record<string, string | undefined> = {
    'verify.pr': args.verifyPr,
    'verify.commit': args.verifyCommit,
    'verify.run_id': args.verifyRunId,
  };
  for (const [key, value] of Object.entries(tags)) {
    if (value) {
      Sentry.setTag(key, String(value));
    }
  }
}
