import type { SeverityLevel } from '@sentry/core';
import { addBreadcrumb, debug } from '@sentry/core';

const DEFAULT_RAGE_TAP_THRESHOLD = 3;
const DEFAULT_RAGE_TAP_TIME_WINDOW = 1000;

export interface TouchedComponentInfo {
  name?: string;
  label?: string;
  element?: string;
  file?: string;
}

export interface RageTapDetectorOptions {
  enabled: boolean;
  threshold: number;
  timeWindow: number;
}

interface RecentTap {
  identity: string;
  timestamp: number;
}

/**
 * Detects rage taps (repeated rapid taps on the same target) and emits
 * `ui.frustration` breadcrumbs when the threshold is hit.
 */
export class RageTapDetector {
  private _recentTaps: RecentTap[] = [];
  private _enabled: boolean;
  private _threshold: number;
  private _timeWindow: number;

  public constructor(options?: Partial<RageTapDetectorOptions>) {
    this._enabled = options?.enabled ?? true;
    this._threshold = options?.threshold ?? DEFAULT_RAGE_TAP_THRESHOLD;
    this._timeWindow = options?.timeWindow ?? DEFAULT_RAGE_TAP_TIME_WINDOW;
  }

  /**
   * Update options at runtime (e.g. when React props change).
   */
  public updateOptions(options: Partial<RageTapDetectorOptions>): void {
    if (options.enabled !== undefined) {
      this._enabled = options.enabled;
    }
    if (options.threshold !== undefined) {
      this._threshold = options.threshold;
    }
    if (options.timeWindow !== undefined) {
      this._timeWindow = options.timeWindow;
    }
  }

  /**
   * Call after each touch event. If a rage tap is detected, a `ui.frustration`
   * breadcrumb is emitted automatically.
   */
  public check(touchPath: TouchedComponentInfo[], label?: string): void {
    if (!this._enabled) {
      return;
    }

    const root = touchPath[0];
    if (!root) {
      return;
    }

    const identity = getTapIdentity(root, label);
    const now = Date.now();
    const rageTapCount = this._detect(identity, now);

    if (rageTapCount > 0) {
      const detail = label ? label : `${root.name}${root.file ? ` (${root.file})` : ''}`;
      addBreadcrumb({
        category: 'ui.frustration',
        data: {
          type: 'rage_tap',
          tapCount: rageTapCount,
          path: touchPath,
          label,
        },
        level: 'warning' as SeverityLevel,
        message: `Rage tap detected on: ${detail}`,
        type: 'user',
      });

      debug.log(`[TouchEvents] Rage tap detected: ${rageTapCount} taps on ${detail}`);
    }
  }

  /**
   * Returns the tap count if rage tap is detected, 0 otherwise.
   */
  private _detect(identity: string, now: number): number {
    // If the target changed, reset the buffer — only truly consecutive
    // taps on the same target count. This prevents false positives where
    // time-window pruning removes interleaved taps on other targets.
    const lastTap = this._recentTaps[this._recentTaps.length - 1];
    if (lastTap && lastTap.identity !== identity) {
      this._recentTaps = [];
    }

    this._recentTaps.push({ identity, timestamp: now });

    // Prune taps outside the time window
    const cutoff = now - this._timeWindow;
    this._recentTaps = this._recentTaps.filter(tap => tap.timestamp >= cutoff);

    if (this._recentTaps.length >= this._threshold) {
      const count = this._recentTaps.length;
      this._recentTaps = [];
      return count;
    }

    return 0;
  }
}

function getTapIdentity(root: TouchedComponentInfo, label?: string): string {
  if (label) {
    return `label:${label}`;
  }
  return `name:${root.name ?? ''}|file:${root.file ?? ''}`;
}
