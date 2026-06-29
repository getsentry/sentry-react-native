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
   *
   * <p>{@code synchronized} so the {@code !enabled && !libraryLoadAttempted} short-circuit and the
   * lazy {@code System.loadLibrary} run under the same monitor. Without this, a thread calling
   * {@code setEnabled(false)} concurrently with another thread already loading the library could
   * observe {@code libraryLoadAttempted == false}, return early, and leave tracking latched on
   * after the loader finishes — the opposite of what the caller asked for. The lock is contended
   * only on the first few calls before the library finishes loading; {@code setEnabled} is invoked
   * once per {@code initNativeSdk} so the overhead is negligible.
   */
  public static synchronized void setEnabled(boolean enabled) {
    if (nativeUnavailable.get()) {
      return;
    }
    // If we are disabling and the library has not yet been loaded, there is
    // nothing to disable: the native flag's default is already `false`.
    // Loading the library only to flip it to its default would break the lazy
    // load contract ("hosts that never opt in pay no native library cost")
    // and reintroduce the cost on every `initNativeSdk` call regardless of
    // whether the user opted in.
    if (!enabled && !libraryLoadAttempted.get()) {
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
   *
   * <p>Synchronized so concurrent first callers block on the in-progress load instead of racing
   * past it and hitting a phantom {@code UnsatisfiedLinkError} on {@code nativeSetEnabled} — which
   * would then latch the tracker into a permanent no-op state for the lifetime of the process. The
   * synchronization cost is paid at most a few times per process: once the load completes, every
   * subsequent caller short-circuits on the early {@code libraryLoadAttempted} check before
   * entering the monitor.
   */
  private static boolean ensureNativeLibraryLoaded() {
    if (libraryLoadAttempted.get()) {
      return !nativeUnavailable.get();
    }
    synchronized (RNSentryTurboModulePerfTracker.class) {
      // Re-check under the monitor in case another thread completed the load while we were
      // queued for the lock.
      if (libraryLoadAttempted.get()) {
        return !nativeUnavailable.get();
      }
      try {
        System.loadLibrary(LIB_NAME);
        // Set the attempted flag last so any reader that observes it also sees the matching
        // `nativeUnavailable` state established above.
        libraryLoadAttempted.set(true);
        return true;
      } catch (UnsatisfiedLinkError e) {
        // Expected on Old Arch and on hosts that strip Sentry's native libraries; the SDK keeps
        // working with only Java-side instrumentation.
        nativeUnavailable.set(true);
        libraryLoadAttempted.set(true);
        Log.i(
            TAG,
            "lib"
                + LIB_NAME
                + ".so not loaded; TurboModule perf tracking unavailable: "
                + e.getMessage());
        return false;
      }
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
