package io.sentry.react;

import com.facebook.hermes.instrumentation.HermesSamplingProfiler;
import java.io.File;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * The Hermes sampling profiler is global to the process. All users share one lock, so a profile and
 * a JS hang sample never enable or disable the sampler under each other.
 */
final class RNSentryHermesSampler {
  private static final Object lock = new Object();
  private static boolean isProfiling = false;

  private RNSentryHermesSampler() {}

  static void startProfiling() {
    synchronized (lock) {
      // Defensive reset: the Hermes sampling profiler is global with no state
      // introspection, so flush any leaked registration from a prior run before
      // enabling. See https://github.com/facebook/hermes/issues/1853.
      HermesSamplingProfiler.disable();
      HermesSamplingProfiler.enable();
      isProfiling = true;
    }
  }

  static void stopProfiling(final @NotNull String tracePath) {
    synchronized (lock) {
      isProfiling = false;
      HermesSamplingProfiler.disable();
      HermesSamplingProfiler.dumpSampledTraceToFile(tracePath);
    }
  }

  /** Disables the sampler without a dump, for example when the React instance is destroyed. */
  static void disable() {
    synchronized (lock) {
      isProfiling = false;
      HermesSamplingProfiler.disable();
    }
  }

  private static void disableQuietly() {
    try {
      HermesSamplingProfiler.disable();
    } catch (Throwable ignored) { // NOPMD - Hermes is missing, for example in JSC apps.
    }
  }

  /**
   * Samples the JS thread for {@code durationMs} and returns the trace. Returns null when a profile
   * is running or when Hermes fails.
   */
  static @Nullable String sample(final long durationMs, final @NotNull File cacheDir) {
    synchronized (lock) {
      if (isProfiling) {
        return null;
      }
      File trace = null;
      try {
        trace = File.createTempFile("sentry-js-hang", ".cpuprofile", cacheDir);
        HermesSamplingProfiler.enable();
        Thread.sleep(durationMs);
        HermesSamplingProfiler.disable();
        HermesSamplingProfiler.dumpSampledTraceToFile(trace.getPath());
        return RNSentryModuleImpl.readStringFromFile(trace);
      } catch (InterruptedException e) {
        disableQuietly();
        Thread.currentThread().interrupt();
        return null;
      } catch (Throwable e) { // NOPMD - We don't want to crash in any case
        disableQuietly();
        return null;
      } finally {
        if (trace != null) {
          trace.delete();
        }
      }
    }
  }
}
