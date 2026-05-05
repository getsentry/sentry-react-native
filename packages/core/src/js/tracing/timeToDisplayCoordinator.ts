/**
 * Coordinator for multi-instance `<TimeToInitialDisplay>` / `<TimeToFullDisplay>`
 * components on a single screen (active span).
 */

type Checkpoint = { ready: boolean };
type Listener = () => void;

interface SpanRegistry {
  checkpoints: Map<string, Checkpoint>;
  listeners: Set<Listener>;
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
      listeners: new Set()
    };
    map.set(parentSpanId, entry);
  }
  return entry;
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
  notify(entry);

  return () => {
    const e = registries[kind].get(parentSpanId);
    if (!e) {
      return;
    }
    if (e.checkpoints.delete(checkpointId)) {
      notify(e);
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
  notify(entry);
}

/**
 * True if at least one checkpoint is registered AND all checkpoints are ready.
 */
export function isAllReady(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  if (!entry || entry.checkpoints.size === 0) {
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
 * Returns true if there is at least one registered checkpoint on this span.
 */
export function hasAnyCheckpoints(kind: DisplayKind, parentSpanId: string): boolean {
  const entry = registries[kind].get(parentSpanId);
  return !!entry && entry.checkpoints.size > 0;
}

/**
 * Subscribe to any checkpoint state change for a given span. The listener is
 * called synchronously after each register/update/unregister event.
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

function notify(entry: SpanRegistry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

/**
 * Test-only. Clears all coordinator state.
 */
export function _resetTimeToDisplayCoordinator(): void {
  registries.ttid.clear();
  registries.ttfd.clear();
}
