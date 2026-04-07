package io.sentry.react;

import java.util.concurrent.atomic.AtomicReference;
import org.jetbrains.annotations.Nullable;

/**
 * Thread-safe cache for the last JavascriptException stack trace string.
 *
 * <p>When React Native throws a JavascriptException on Android, the native Sentry SDK intercepts it
 * in beforeSend and caches the stack trace here. The JS side can then retrieve it to enrich error
 * events that arrive without a stack trace.
 */
final class RNSentryJavascriptExceptionCache {

  private static final long TTL_MS = 5000;

  private static final AtomicReference<CachedEntry> cache = new AtomicReference<>(null);

  private RNSentryJavascriptExceptionCache() {}

  static void cache(@Nullable String jsStackTrace) {
    if (jsStackTrace == null || jsStackTrace.isEmpty()) {
      return;
    }
    cache.set(new CachedEntry(jsStackTrace, System.currentTimeMillis()));
  }

  @Nullable
  static String getAndClear() {
    CachedEntry entry = cache.getAndSet(null);
    if (entry == null) {
      return null;
    }
    if (System.currentTimeMillis() - entry.timestampMs > TTL_MS) {
      return null;
    }
    return entry.jsStackTrace;
  }

  /** Clears the cache. Visible for testing. */
  static void clear() {
    cache.set(null);
  }

  private static final class CachedEntry {
    final String jsStackTrace;
    final long timestampMs;

    CachedEntry(String jsStackTrace, long timestampMs) {
      this.jsStackTrace = jsStackTrace;
      this.timestampMs = timestampMs;
    }
  }
}
