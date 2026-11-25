import { execFileSync } from 'node:child_process';

const APP_ID = 'io.sentry.reactnative.sample';

type E2EPlatform = 'android' | 'ios';

declare const E2E_PLATFORM: E2EPlatform | undefined;

/**
 * Stops the sample app if it is still running from a previous test.
 *
 * Each test file starts its own mocked Sentry server, but the app launched by the
 * previous test file keeps running until the next Maestro flow relaunches it. Any
 * transaction that app finishes in the meantime (idle navigation spans end seconds
 * later) would be delivered to the new server and mixed into the new test's envelopes.
 */
export function stopApp(): void {
  const platform = typeof E2E_PLATFORM === 'undefined' ? undefined : E2E_PLATFORM;
  try {
    if (platform === 'android') {
      execFileSync('adb', ['shell', 'am', 'force-stop', APP_ID], { stdio: 'ignore' });
    } else if (platform === 'ios') {
      execFileSync('xcrun', ['simctl', 'terminate', 'booted', APP_ID], { stdio: 'ignore' });
    }
  } catch {
    // The app is not running, which is the state we want.
  }
}
