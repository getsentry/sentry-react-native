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

function performCleanup(kind: DisplayKind, parentSpanId: string, entry: SpanRegistry): void {
  if (entry.checkpoints.size === 0 && entry.listeners.size === 0) {
    registries[kind].delete(parentSpanId);
  }
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
    if (e.checkpoints.delete(checkpointId)) {
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
