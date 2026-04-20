import type { SeverityLevel } from '@sentry/core';
import { addBreadcrumb, debug } from '@sentry/core';

import { getCurrentReactNativeTracingIntegration } from './tracing/reactnativetracing';

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
 * `ui.multiClick` breadcrumbs when the threshold is hit.
 *
 * Uses the same breadcrumb category and data shape as the web JS SDK's
 * rage click detection so the Sentry replay timeline renders the fire
 * icon and "Rage Click" label automatically.
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
      if (!this._enabled) {
        this._recentTaps = [];
      }
    }
    if (options.threshold !== undefined) {
      this._threshold = options.threshold;
    }
    if (options.timeWindow !== undefined) {
      this._timeWindow = options.timeWindow;
    }
  }

  /**
   * Call after each touch event. If a rage tap is detected, a `ui.multiClick`
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
    const tapCount = this._detect(identity, now);

    if (tapCount > 0) {
      const message = buildTouchMessage(root, label);
      const node = buildNodeFromTouchPath(root, label);

      addBreadcrumb({
        category: 'ui.multiClick',
        type: 'default',
        level: 'warning' as SeverityLevel,
        message,
        data: {
          clickCount: tapCount,
          metric: true,
          route: getCurrentRoute(),
          node,
          path: touchPath,
        },
      });

      debug.log(`[TouchEvents] Rage tap detected: ${tapCount} taps on ${message}`);
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
  const base = `name:${root.name ?? ''}|file:${root.file ?? ''}`;
  if (label) {
    return `label:${label}|${base}`;
  }
  return base;
}

/**
 * Build a human-readable message matching the touch breadcrumb format.
 */
function buildTouchMessage(root: TouchedComponentInfo, label?: string): string {
  if (label) {
    return label;
  }
  return `${root.name}${root.file ? ` (${root.file})` : ''}`;
}

/**
 * Build a node object compatible with the web SDK's `ReplayBaseDomFrameData`
 * so that `stringifyNodeAttributes` in the Sentry frontend can render it.
 *
 * Maps the React Native component info to the DOM-like shape:
 * - `tagName` → element type (e.g. "RCTView") or component name
 * - `attributes['data-sentry-component']` → component name from babel plugin
 * - `attributes['data-sentry-source-file']` → source file
 */
function buildNodeFromTouchPath(
  root: TouchedComponentInfo,
  label?: string,
): { id: number; tagName: string; textContent: string; attributes: Record<string, string> } {
  const attributes: Record<string, string> = {};

  if (root.name) {
    attributes['data-sentry-component'] = root.name;
  }
  if (root.file) {
    attributes['data-sentry-source-file'] = root.file;
  }
  if (label) {
    attributes['sentry-label'] = label;
  }

  return {
    id: 0,
    tagName: root.element ?? root.name ?? 'unknown',
    textContent: '',
    attributes,
  };
}

function getCurrentRoute(): string | undefined {
  try {
    return getCurrentReactNativeTracingIntegration()?.state.currentRoute;
  } catch {
    return undefined;
  }
}
