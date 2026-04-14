import type { SeverityLevel } from '@sentry/core';
import { addBreadcrumb, debug } from '@sentry/core';

const DEFAULT_RAGE_TAP_THRESHOLD = 3;
const DEFAULT_RAGE_TAP_TIME_WINDOW = 1000;
const MAX_RECENT_TAPS = 10;

interface RecentTap {
  identity: string;
  timestamp: number;
}

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
    this._recentTaps.push({ identity, timestamp: now });

    // Keep buffer bounded
    if (this._recentTaps.length > MAX_RECENT_TAPS) {
      this._recentTaps = this._recentTaps.slice(-MAX_RECENT_TAPS);
    }

    // Prune taps outside the time window
    const cutoff = now - this._timeWindow;
    this._recentTaps = this._recentTaps.filter(tap => tap.timestamp >= cutoff);

    // Count consecutive taps on the same target (from the end)
    let count = 0;
    for (let i = this._recentTaps.length - 1; i >= 0; i--) {
      if (this._recentTaps[i]?.identity === identity) {
        count++;
      } else {
        break;
      }
    }

    if (count >= this._threshold) {
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
