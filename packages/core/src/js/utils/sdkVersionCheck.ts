import { debug, getMainCarrier, SDK_VERSION as CORE_SDK_VERSION } from '@sentry/core';

export function checkSentryJsSdkVersionMismatch(): void {
  if (!__DEV__) {
    return;
  }

  try {
    const carrier = getMainCarrier();
    const sentryCarrier = carrier.__SENTRY__;
    if (!sentryCarrier) {
      return;
    }

    const versions = Object.keys(sentryCarrier).filter(key => key !== CORE_SDK_VERSION && key !== 'version');
    if (versions.length === 0) {
      return;
    }

    debug.warn(
      `Multiple versions of Sentry JavaScript SDKs were detected in your application. ` +
        `Found versions: ${[CORE_SDK_VERSION, ...versions].join(', ')}. ` +
        `This may cause unexpected behavior. ` +
        `Ensure all Sentry packages use the same version. ` +
        `See https://docs.sentry.io/platforms/react-native/troubleshooting/ for more details.`,
    );
  } catch (_e) {
    // Ignore errors from version check
  }
}
