package io.sentry.react;

import android.util.Log;
import java.util.concurrent.atomic.AtomicBoolean;
import org.jetbrains.annotations.TestOnly;

/**
 * Thin Java façade over the native runtime flag exposed by {@code libsentry-tm-perf-logger.so}.
 *
 * <p>The native library is loaded lazily on the first call to {@link #setEnabled(boolean)}, not
 * from a static initializer. Hosts that never opt in to {@code enableTurboModuleTracking} pay no
 * shared-library mapping cost; the {@code .so} is only resolved when tracking is actually toggled
 * on. We never call {@code System.loadLibrary} again once it has failed once.
 *
 * <p>The native library is only built when the consuming app is using React Native's New
 * Architecture (see {@code CMakeLists.txt} and {@code build.gradle}). On Old Architecture the
 * underlying {@code .so} is not packaged, so {@link #setEnabled(boolean)} hits an {@link
 * UnsatisfiedLinkError} which we swallow — TurboModule perf tracking is a no-op there.
 */
public final class RNSentryTurboModulePerfTracker {

  private static final String TAG = "RNSentry";
  private static final String LIB_NAME = "sentry-tm-perf-logger";

  /**
   * Remembers whether we have already discovered the native symbol to be missing. After the first
   * {@code UnsatisfiedLinkError} we stop trying — there is no scenario where the link suddenly
   * succeeds within the same process lifetime. Using {@code AtomicBoolean} instead of {@code
   * volatile} to satisfy the project-wide PMD rule ({@code AvoidUsingVolatile}).
   */
  private static final AtomicBoolean nativeUnavailable = new AtomicBoolean(false);

  /**
   * Tracks whether {@link System#loadLibrary(String)} has already been attempted (regardless of
   * outcome) so the second and later {@link #setEnabled(boolean)} calls do not re-run the load.
   * Combined with {@link #nativeUnavailable} this gives us a one-way state machine: <em>not
   * loaded</em> → <em>loaded</em> or <em>permanently unavailable</em>.
   */
  private static final AtomicBoolean libraryLoadAttempted = new AtomicBoolean(false);

  private RNSentryTurboModulePerfTracker() {}

  /**
   * Toggle the perf-logger sink. When {@code false} (the default) every TurboModule callback the
   * logger receives is dropped after one atomic check — there is effectively no overhead. When
   * {@code true} the callback is forwarded to whichever sink is currently installed in C++.
   *
   * <p>The first invocation lazily loads {@code libsentry-tm-perf-logger.so}; subsequent calls
   * reuse the already-loaded library. A missing {@code .so} (Old Architecture, stripped binary)
   * permanently latches the tracker into a no-op state.
   */
  public static void setEnabled(boolean enabled) {
    if (nativeUnavailable.get()) {
      return;
    }
    if (!ensureNativeLibraryLoaded()) {
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

  /**
   * Attempts {@code System.loadLibrary} once and remembers the outcome. Returns {@code true} when
   * the library is (or just became) available, {@code false} when it could not be loaded.
   */
  private static boolean ensureNativeLibraryLoaded() {
    if (!libraryLoadAttempted.compareAndSet(false, true)) {
      // Another caller already tried. The outcome is encoded in `nativeUnavailable`.
      return !nativeUnavailable.get();
    }
    try {
      System.loadLibrary(LIB_NAME);
      return true;
    } catch (UnsatisfiedLinkError e) {
      // Expected on Old Arch and on hosts that strip Sentry's native libraries; the SDK keeps
      // working with only Java-side instrumentation.
      nativeUnavailable.set(true);
      Log.i(
          TAG,
          "lib"
              + LIB_NAME
              + ".so not loaded; TurboModule perf tracking unavailable: "
              + e.getMessage());
      return false;
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
    libraryLoadAttempted.set(false);
  }
}
