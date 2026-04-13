package io.sentry.react;

import io.sentry.android.core.internal.util.SentryFrameMetricsCollector;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.jetbrains.annotations.Nullable;

/**
 * Collects per-frame delay data from {@link SentryFrameMetricsCollector} and provides a method to
 * query the accumulated delay within a given time range.
 *
 * <p>This is a temporary solution until sentry-java exposes a queryable API for frames delay
 * (similar to sentry-cocoa's getFramesDelaySPI).
 */
public class RNSentryFrameDelayCollector
    implements SentryFrameMetricsCollector.FrameMetricsCollectorListener {

  private static final long MAX_FRAME_AGE_NANOS = 5L * 60 * 1_000_000_000L; // 5 minutes

  private final List<FrameRecord> frames = new CopyOnWriteArrayList<>();

  private @Nullable String listenerId;
  private @Nullable SentryFrameMetricsCollector collector;

  /**
   * Starts collecting frame delay data from the given collector.
   *
   * @return true if collection was started successfully
   */
  public boolean start(@Nullable SentryFrameMetricsCollector frameMetricsCollector) {
    if (frameMetricsCollector == null) {
      return false;
    }
    stop();
    this.collector = frameMetricsCollector;
    this.listenerId = frameMetricsCollector.startCollection(this);
    return this.listenerId != null;
  }

  /** Stops collecting frame delay data. */
  public void stop() {
    if (collector != null && listenerId != null) {
      collector.stopCollection(listenerId);
      listenerId = null;
      collector = null;
    }
    frames.clear();
  }

  @Override
  public void onFrameMetricCollected(
      long frameStartNanos,
      long frameEndNanos,
      long durationNanos,
      long delayNanos,
      boolean isSlow,
      boolean isFrozen,
      float refreshRate) {
    if (delayNanos <= 0) {
      return;
    }
    frames.add(new FrameRecord(frameStartNanos, frameEndNanos, delayNanos));
    pruneOldFrames(frameEndNanos);
  }

  /**
   * Returns the total frames delay in seconds for the given time range.
   *
   * <p>Handles partial overlap: if a frame's delay period partially falls within the query range,
   * only the overlapping portion is counted.
   *
   * @param startNanos start of the query range in system nanos (e.g., System.nanoTime())
   * @param endNanos end of the query range in system nanos
   * @return delay in seconds, or -1 if no data is available
   */
  public double getFramesDelay(long startNanos, long endNanos) {
    if (startNanos >= endNanos) {
      return -1;
    }

    long totalDelayNanos = 0;

    for (FrameRecord frame : frames) {
      if (frame.endNanos <= startNanos) {
        continue;
      }
      if (frame.startNanos >= endNanos) {
        break;
      }

      // The delay portion of a frame is at the end of the frame duration.
      // delayStart = frameEnd - delay, delayEnd = frameEnd
      long delayStart = frame.endNanos - frame.delayNanos;
      long delayEnd = frame.endNanos;

      // Intersect the delay interval with the query range
      long overlapStart = Math.max(delayStart, startNanos);
      long overlapEnd = Math.min(delayEnd, endNanos);

      if (overlapEnd > overlapStart) {
        totalDelayNanos += (overlapEnd - overlapStart);
      }
    }

    return totalDelayNanos / 1e9;
  }

  private void pruneOldFrames(long currentNanos) {
    long cutoff = currentNanos - MAX_FRAME_AGE_NANOS;
    // Remove from the front one-by-one. CopyOnWriteArrayList.remove(0) is O(n) per call,
    // but old frames are pruned incrementally so typically only 0-1 entries are removed.
    while (!frames.isEmpty() && frames.get(0).endNanos < cutoff) {
      frames.remove(0);
    }
  }

  private static class FrameRecord {
    final long startNanos;
    final long endNanos;
    final long delayNanos;

    FrameRecord(long startNanos, long endNanos, long delayNanos) {
      this.startNanos = startNanos;
      this.endNanos = endNanos;
      this.delayNanos = delayNanos;
    }
  }
}
