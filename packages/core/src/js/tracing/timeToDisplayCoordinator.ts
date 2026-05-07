/**
 * Coordinator for multi-instance `<TimeToInitialDisplay>` / `<TimeToFullDisplay>`
 * components on a single screen (active span).
 */

type Checkpoint = { ready: boolean };
type Listener = () => void;

interface SpanRegistry {
  checkpoints: Map<string, Checkpoint>;
  listeners: Set<Listener>;
  // this value answers the question "are all checkpoints on this span ready?"
  // when the raw value goes from false to true, aggregateReady does NOT flip immediately, it gets
  // scheduled with setTimeout(0) in `reevaluate` function
  //
  aggregateReady: boolean;
  // when non-null, an up-flip is scheduled but has not yet been applied to `aggregateReady`
  pendingUpFlip: ReturnType<typeof setTimeout> | null;
  // `sticky` is used indicate checkpints that gets cleared when the screen fully unmounts
  // it's useful
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
      pendingUpFlip: null,
      sticky: new Set(),
    };
    map.set(parentSpanId, entry);
  }
  return entry;
}

function cancelPendingUpFlip(entry: SpanRegistry): void {
  if (entry.pendingUpFlip !== null) {
    clearTimeout(entry.pendingUpFlip);
    entry.pendingUpFlip = null;
  }
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

// Recompute the raw aggregate and reconcile it with the cached `aggregateReady`
function reevaluate(entry: SpanRegistry): void {
  const raw = computeAggregate(entry);

  if (raw === entry.aggregateReady) {
    cancelPendingUpFlip(entry);
    return;
  }

  if (!raw) {
    cancelPendingUpFlip(entry);
    entry.aggregateReady = false;
    notifyListeners(entry);
    return;
  }

  if (entry.pendingUpFlip !== null) {
    return;
  }
  // the delay here is set to 0 because in React 18 that
  // will schedule the callback to be run asynchronously after the shortest possible delay
  entry.pendingUpFlip = setTimeout(() => {
    entry.pendingUpFlip = null;
    // Re-check on fire — a peer may have un-readied between schedule and now.
    if (!computeAggregate(entry) || entry.aggregateReady) {
      return;
    }
    entry.aggregateReady = true;
    notifyListeners(entry);
  }, 0);
}

function notifyListeners(entry: SpanRegistry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function performCleanup(kind: DisplayKind, parentSpanId: string, entry: SpanRegistry): void {
  const liveCheckpoints = entry.checkpoints.size - entry.sticky.size;
  if (liveCheckpoints === 0 && entry.listeners.size === 0) {
    cancelPendingUpFlip(entry);
    registries[kind].delete(parentSpanId);
  }
}

// A bit of a hack but this is used to detect the premature-fire scenario
// where a not-ready checkpoint unmounts while every other checkpoint is ready:
// deleting it would let the aggregate flip to true and immediately record TTFD/TTID,
// even though the unmounting source never actually became ready.
function isSoleBlocker(entry: SpanRegistry, checkpointId: string): boolean {
  if (entry.aggregateReady) {
    return false;
  }
  if (entry.checkpoints.size <= 1) {
    // because removing the only checkpoint leaves the registry empty
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
    // if the checkpoint is the only blocker then removing it would flip the
    // aggregate to true and fire TTFD/TTID even though the unmounting source never became ready.
    // that's why we use `sticky` here to indicate that it gets cleared when the screen fully unmounts
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

// Returns true if at least one checkpoint is registered AND all checkpoints are ready
export function isAllReady(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  return !!entry && entry.aggregateReady;
}

// Returns true if there is at least one registered checkpoint on this span
export function hasAnyCheckpoints(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  return !!entry && entry.checkpoints.size > 0;
}

// Subscribe to aggregate-ready transitions for a given span
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

// Drop coordinator state for `parentSpanId` across both kinds.
// Called by the time-to-display integration once a transaction has been
// processed, since the per-span coordinator state is no longer relevant
// after the native draw timestamps have been read.
export function clearSpan(parentSpanId: string): void {
  for (const kind of [TTID, TTFD] as const) {
    const entry = registries[kind].get(parentSpanId);
    if (entry) {
      cancelPendingUpFlip(entry);
      registries[kind].delete(parentSpanId);
    }
  }
}

export function _resetTimeToDisplayCoordinator(): void {
  for (const kind of [TTID, TTFD] as const) {
    for (const entry of registries[kind].values()) {
      cancelPendingUpFlip(entry);
    }
    registries[kind].clear();
  }
}
