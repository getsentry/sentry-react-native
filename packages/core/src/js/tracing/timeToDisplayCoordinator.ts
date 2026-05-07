/**
 * Coordinator for multi-instance `<TimeToInitialDisplay>` / `<TimeToFullDisplay>`
 * components on a single screen (active span).
 */

type Checkpoint = { ready: boolean };
type Listener = () => void;

interface SpanRegistry {
  checkpoints: Map<string, Checkpoint>;
  listeners: Set<Listener>;
  /**
   * Last-observed aggregate ready state. Used to avoid waking subscribers when
   * a checkpoint change does not flip the aggregate — the dominant lifecycle
   * pattern is "all checkpoints register as not-ready, then flip to ready over
   * time", and only the final flip needs to notify.
   */
  aggregateReady: boolean;
  /**
   * Checkpoint ids whose components have unmounted but are kept in the
   * registry to prevent a premature aggregate flip (sole-blocker safeguard).
   * They participate in `computeAggregate` but are excluded from the
   * "live work" count in `performCleanup`.
   */
  sticky: Set<string>;
}

const TTID = 'ttid';
const TTFD = 'ttfd';

export type DisplayKind = typeof TTID | typeof TTFD;

const registries: Record<DisplayKind, Map<string, SpanRegistry>> = {
  ttid: new Map(),
  ttfd: new Map(),
};

function getOrCreate(kind: DisplayKind, parentSpanId: string): SpanRegistry {
  const map = registries[kind];
  let entry = map.get(parentSpanId);
  if (!entry) {
    entry = {
      checkpoints: new Map(),
      listeners: new Set(),
      aggregateReady: false,
      sticky: new Set(),
    };
    map.set(parentSpanId, entry);
  }
  return entry;
}

function computeAggregate(entry: SpanRegistry): boolean {
  if (entry.checkpoints.size === 0) {
    return false;
  }
  for (const cp of entry.checkpoints.values()) {
    if (!cp.ready) {
      return false;
    }
  }
  return true;
}

/**
 * Recompute the aggregate; if it flipped, update the cached value and notify.
 * No-op when the aggregate is unchanged — this is what avoids the O(N²)
 * notify-storm when many checkpoints register/update without crossing the
 * aggregate boundary.
 */
function reevaluate(entry: SpanRegistry): void {
  const next = computeAggregate(entry);
  if (next === entry.aggregateReady) {
    return;
  }
  entry.aggregateReady = next;
  for (const listener of entry.listeners) {
    listener();
  }
}

/**
 * Delete the registry entry once there is no live work attached to it.
 *
 * "Live work" means either subscribed listeners (registry-mode components
 * still mounted) or non-sticky checkpoints (still-mounted registrations).
 * Sticky checkpoints (kept after a not-ready unmount; see `unregister`)
 * exist only to prevent premature aggregate flips while the screen is still
 * mounted; once every live counterpart is gone, they are orphaned and safe
 * to drop along with the entry.
 */
function performCleanup(kind: DisplayKind, parentSpanId: string, entry: SpanRegistry): void {
  const liveCheckpoints = entry.checkpoints.size - entry.sticky.size;
  if (liveCheckpoints === 0 && entry.listeners.size === 0) {
    registries[kind].delete(parentSpanId);
  }
}

/**
 * True iff removing `checkpointId` from `entry` would flip the aggregate
 * from false to true — i.e., the checkpoint is the sole blocker.
 *
 * Used to detect the premature-fire scenario where a not-ready checkpoint
 * unmounts while every other checkpoint is ready: deleting it would let the
 * aggregate flip to true and immediately record TTFD/TTID, even though the
 * unmounting source never actually became ready.
 */
function isSoleBlocker(entry: SpanRegistry, checkpointId: string): boolean {
  if (entry.aggregateReady) {
    return false;
  }
  if (entry.checkpoints.size <= 1) {
    // Removing the only checkpoint leaves the registry empty, which yields
    // aggregate=false (per `computeAggregate`). No flip.
    return false;
  }
  const cp = entry.checkpoints.get(checkpointId);
  if (!cp || cp.ready) {
    return false;
  }
  for (const [id, other] of entry.checkpoints) {
    if (id === checkpointId) {
      continue;
    }
    if (!other.ready) {
      return false;
    }
  }
  return true;
}

/**
 * Register a checkpoint under (kind, parentSpanId). Returns an unregister fn.
 */
export function registerCheckpoint(
  kind: DisplayKind,
  parentSpanId: string,
  checkpointId: string,
  ready: boolean,
): () => void {
  const entry = getOrCreate(kind, parentSpanId);
  entry.checkpoints.set(checkpointId, { ready });
  reevaluate(entry);

  return () => {
    const e = registries[kind].get(parentSpanId);
    if (!e) {
      return;
    }
    // If this checkpoint is the sole blocker, removing it would flip the
    // aggregate to true and prematurely fire TTFD/TTID even though the
    // unmounting source never became ready. Keep the checkpoint sticky;
    // it gets cleared when the screen fully unmounts.
    if (isSoleBlocker(e, checkpointId)) {
      e.sticky.add(checkpointId);
      performCleanup(kind, parentSpanId, e);
      return;
    }
    if (e.checkpoints.delete(checkpointId)) {
      e.sticky.delete(checkpointId);
      reevaluate(e);
    }
    performCleanup(kind, parentSpanId, e);
  };
}

/**
 * Update an existing checkpoint's ready state.
 */
export function updateCheckpoint(
  kind: DisplayKind,
  parentSpanId: string,
  checkpointId: string,
  ready: boolean,
): void {
  const entry = registries[kind].get(parentSpanId);
  const cp = entry?.checkpoints.get(checkpointId);
  if (!entry || !cp || cp.ready === ready) {
    return;
  }
  cp.ready = ready;
  reevaluate(entry);
}

/**
 * True if at least one checkpoint is registered AND all checkpoints are ready.
 * Reads the cached aggregate — O(1).
 */
export function isAllReady(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  return !!entry && entry.aggregateReady;
}

/**
 * Returns true if there is at least one registered checkpoint on this span.
 */
export function hasAnyCheckpoints(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  return !!entry && entry.checkpoints.size > 0;
}

/**
 * Subscribe to aggregate-ready transitions for a given span. The listener is
 * called only when the aggregate flips, not on every individual checkpoint
 * change.
 */
export function subscribe(kind: DisplayKind, parentSpanId: string, listener: Listener): () => void {
  const entry = getOrCreate(kind, parentSpanId);
  entry.listeners.add(listener);
  return () => {
    const e = registries[kind].get(parentSpanId);
    if (!e) {
      return;
    }
    e.listeners.delete(listener);
    performCleanup(kind, parentSpanId, e);
  };
}

/**
 * Test-only. Clears all coordinator state.
 */
export function _resetTimeToDisplayCoordinator(): void {
  registries.ttid.clear();
  registries.ttfd.clear();
}
