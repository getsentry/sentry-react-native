package io.sentry.react;

import android.util.Log;
import java.util.concurrent.atomic.AtomicBoolean;
import org.jetbrains.annotations.TestOnly;

/**
 * Thin Java façade over the native runtime flag installed by {@code libsentry-tm-perf-logger.so}.
 *
 * <p>The native library is only built when the consuming app is using React Native's New
 * Architecture (see {@code CMakeLists.txt} and {@code build.gradle}). On Old Architecture the
 * underlying {@code .so} is not packaged, so the first call to {@link #setEnabled(boolean)} hits an
 * {@link UnsatisfiedLinkError} which we swallow — TurboModule perf tracking is a no-op there.
 *
 * <p>We deliberately keep the linkage check lazy (try-catch on first invocation) instead of probing
 * at class load time so that the SDK's {@code initNativeSdk} call path stays the single source of
 * truth for whether tracking is on.
 */
public final class RNSentryTurboModulePerfTracker {

  private static final String TAG = "RNSentry";

  /**
   * Remembers whether we have already discovered the native symbol to be missing. After the first
   * UnsatisfiedLinkError we stop trying — there is no scenario where the link suddenly succeeds
   * within the same process lifetime. Using `AtomicBoolean` instead of `volatile` to satisfy the
   * project-wide PMD rule (`AvoidUsingVolatile`).
   */
  private static final AtomicBoolean nativeUnavailable = new AtomicBoolean(false);

  private RNSentryTurboModulePerfTracker() {}

  /**
   * Toggle the perf-logger sink. When {@code false} (the default) every TurboModule callback the
   * logger receives is dropped after one atomic check — there is effectively no overhead. When
   * {@code true} the callback is forwarded to whichever sink is currently installed in C++.
   */
  public static void setEnabled(boolean enabled) {
    if (nativeUnavailable.get()) {
      return;
    }
    try {
      nativeSetEnabled(enabled);
    } catch (UnsatisfiedLinkError e) {
      nativeUnavailable.set(true);
      Log.i(
          TAG,
          "TurboModule perf-logger native symbol not found; tracking disabled: " + e.getMessage());
    }
  }

  private static native void nativeSetEnabled(boolean enabled);

  @TestOnly
  public static boolean isNativeUnavailableForTests() {
    return nativeUnavailable.get();
  }

  @TestOnly
  public static void resetNativeUnavailableForTests() {
    nativeUnavailable.set(false);
  }
}
