package io.sentry.react;

import com.facebook.hermes.instrumentation.HermesSamplingProfiler;
import java.io.File;
import java.io.IOException;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jetbrains.annotations.TestOnly;

/**
 * The Hermes sampling profiler is global to the process. Profiling and JS hang samples share one
 * lock, so they never enable or disable the sampler under each other.
 *
 * <p>The sampler must be off before React Native destroys the JS thread, because Hermes releases
 * before the fix for https://github.com/facebook/hermes/issues/1853 call {@code pthread_kill} on
 * the exited thread and abort the process.
 */
final class RNSentryHermesSampler {
  interface Profiler {
    void enable();

    void disable();

    void dumpSampledTraceToFile(@NotNull String path);
  }

  private static final Object lock = new Object();

  private static final @NotNull Profiler hermesProfiler =
      new Profiler() {
        @Override
        public void enable() {
          HermesSamplingProfiler.enable();
        }

        @Override
        public void disable() {
          HermesSamplingProfiler.disable();
        }

        @Override
        public void dumpSampledTraceToFile(final @NotNull String path) {
          HermesSamplingProfiler.dumpSampledTraceToFile(path);
        }
      };

  private static @NotNull Profiler profiler = hermesProfiler;

  private static boolean isProfiling = false;

  private RNSentryHermesSampler() {}

  static void startProfiling() {
    synchronized (lock) {
      // The sampler has no state introspection, so flush a leaked registration first.
      profiler.disable();
      profiler.enable();
      isProfiling = true;
    }
  }

  /**
   * Stops the profile and returns its trace file. The sampler is off even when creating the file
   * fails, and no JS hang sample can replace the profile samples before the dump.
   */
  static @NotNull File stopProfiling(final @NotNull File cacheDir) throws IOException {
    synchronized (lock) {
      isProfiling = false;
      profiler.disable();
      final File trace = File.createTempFile("sampling-profiler-trace", ".cpuprofile", cacheDir);
      profiler.dumpSampledTraceToFile(trace.getPath());
      return trace;
    }
  }

  /** Disables the sampler without a dump, for example when the React instance is destroyed. */
  static void disableProfiling() {
    synchronized (lock) {
      isProfiling = false;
      profiler.disable();
    }
  }

  /**
   * Samples the JS thread for up to {@code durationMs} and returns the trace. An interrupt ends the
   * sample early. Returns null while a profile runs, or when Hermes fails.
   */
  static @Nullable String sample(final long durationMs, final @NotNull File cacheDir) {
    synchronized (lock) {
      if (isProfiling) {
        return null;
      }
      File trace = null;
      boolean enabled = false;
      try {
        trace = File.createTempFile("sentry-js-hang", ".cpuprofile", cacheDir);
        profiler.enable();
        enabled = true;
        try {
          // Holds the lock, so a profile cannot start in the middle of the sample.
          Thread.sleep(durationMs);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
        profiler.disable();
        enabled = false;
        profiler.dumpSampledTraceToFile(trace.getPath());
        return RNSentryModuleImpl.readStringFromFile(trace);
      } catch (Throwable e) { // NOPMD - We don't want to crash in any case
        return null;
      } finally {
        if (enabled) {
          disableQuietly();
        }
        if (trace != null) {
          trace.delete();
        }
      }
    }
  }

  private static void disableQuietly() {
    try {
      profiler.disable();
    } catch (Throwable ignored) { // NOPMD - Best-effort cleanup.
    }
  }

  /** Replaces the Hermes sampler in tests. Null restores it. */
  @TestOnly
  static void setProfiler(final @Nullable Profiler testProfiler) {
    synchronized (lock) {
      profiler = testProfiler != null ? testProfiler : hermesProfiler;
      isProfiling = false;
    }
  }
}
