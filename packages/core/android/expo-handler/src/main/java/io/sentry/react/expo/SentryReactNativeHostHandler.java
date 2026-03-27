package io.sentry.react.expo;

import androidx.annotation.NonNull;
import expo.modules.core.interfaces.ReactNativeHostHandler;
import io.sentry.Sentry;
import io.sentry.exception.ExceptionMechanismException;
import io.sentry.protocol.Mechanism;

/**
 * Captures native Android exceptions that are routed through Expo's {@code
 * ExpoReactHostDelegate.handleInstanceException}.
 *
 * <p>On Expo SDK 53+, certain native exceptions (e.g., IllegalStateException from Fabric's
 * SurfaceMountingManager) are caught by React Native and routed to {@code handleInstanceException}.
 * Expo's implementation iterates registered host handlers but does not rethrow, so the exception
 * never reaches Java's {@code UncaughtExceptionHandler} which Sentry relies on for crash capture.
 *
 * <p>This handler captures those exceptions directly via {@code Sentry.captureException} with an
 * unhandled mechanism, ensuring they appear as crashes in Sentry.
 */
public class SentryReactNativeHostHandler implements ReactNativeHostHandler {

  private static final String MECHANISM_TYPE = "expoReactHost";

  @Override
  public void onReactInstanceException(boolean useDeveloperSupport, @NonNull Exception exception) {
    if (useDeveloperSupport) {
      return;
    }

    if (!Sentry.isEnabled()) {
      return;
    }

    try { // NOPMD - We don't want to crash in any case
      final Mechanism mechanism = new Mechanism();
      mechanism.setType(MECHANISM_TYPE);
      mechanism.setHandled(false);

      final ExceptionMechanismException mechanismException =
          new ExceptionMechanismException(mechanism, exception, Thread.currentThread());

      Sentry.captureException(mechanismException);
    } catch (Throwable ignored) { // NOPMD - We don't want to crash in any case
      // ignore
    }
  }
}
