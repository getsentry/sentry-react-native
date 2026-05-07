/**
 * Coordinator for multi-instance `<TimeToInitialDisplay>` / `<TimeToFullDisplay>`
 * components on a single screen (active span).
 *
 * The aggregate "ready" state exposed via `isAllReady` is *deferred* on its
 * way up: when the raw aggregate flips false→true, we schedule the public
 * value to flip on the next macrotask. Down-flips (true→false) are
 * immediate and cancel any pending up-flip.
 *
 * Why: in React 18, a typical "parent renders → parent useEffect setState
 * → child mounts on next commit" wave executes synchronously inside one
 * event-loop task. A `setTimeout(0)` reliably runs after that whole wave,
 * so cross-commit-but-same-task peer registrations are absorbed before the
 * coordinator declares itself ready. Without the defer, a header that
 * registers and is alone-and-ready would emit `fullDisplay=true`
 * immediately, the native reporter would fire on the next draw, and a
 * sibling sidebar mounting on the next commit could only un-ready the
 * aggregate after the (now stuck) native timestamp has already been
 * recorded.
 *
 * The defer does NOT cover arbitrary-async deferred mounting (e.g. mount a
 * checkpoint after a fetch resolves). That class of usage is documented
 * against — the recommended pattern is to mount all checkpoints at screen
 * mount with `ready=false` and flip them as data arrives.
 */

type Checkpoint = { ready: boolean };
type Listener = () => void;

interface SpanRegistry {
  checkpoints: Map<string, Checkpoint>;
  listeners: Set<Listener>;
  /**
   * Stable, deferred view of the aggregate exposed via `isAllReady`. Lags
   * raw `computeAggregate` on up-flips by `READY_DEFER_MS`, immediate on
   * down-flips. Used to avoid waking subscribers when a checkpoint change
   * does not flip the aggregate — the dominant lifecycle pattern is "all
   * checkpoints register as not-ready, then flip to ready over time", and
   * only the final flip needs to notify.
   */
  aggregateReady: boolean;
  /**
   * Pending up-flip timer. When non-null, an up-flip is scheduled but has
   * not yet been applied to `aggregateReady`. Cleared either when the timer
   * fires or when an intervening change cancels the pending up-flip.
   */
  pendingUpFlip: ReturnType<typeof setTimeout> | null;
  /**
   * Checkpoint ids whose components have unmounted but are kept in the
   * registry to prevent a premature aggregate flip (sole-blocker safeguard).
   * They participate in `computeAggregate` but are excluded from the
   * "live work" count in `performCleanup`.
   */
  sticky: Set<string>;
}

/**
 * Defer applied to up-flips. Zero macrotask is enough to absorb a same-task
 * cascade of useEffect-driven child mounts in React 18.
 */
const READY_DEFER_MS = 0;

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

/**
 * Recompute the raw aggregate and reconcile it with the cached
 * `aggregateReady`. Up-flips are deferred to absorb same-task peer mounts;
 * down-flips are immediate and cancel any pending up-flip.
 *
 * Transition matrix (raw, stable) → action:
 *   (false, false): no-op; cancel pending up-flip if any (it became stale).
 *   (true,  true):  no-op; cancel pending up-flip if any.
 *   (false, true):  immediate down-flip + notify; cancel pending up-flip.
 *   (true,  false): schedule up-flip if not already pending.
 */
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

  // raw=true, stable=false: schedule deferred up-flip.
  if (entry.pendingUpFlip !== null) {
    return;
  }
  entry.pendingUpFlip = setTimeout(() => {
    entry.pendingUpFlip = null;
    // Re-check on fire — a peer may have un-readied between schedule and now.
    if (!computeAggregate(entry) || entry.aggregateReady) {
      return;
    }
    entry.aggregateReady = true;
    notifyListeners(entry);
  }, READY_DEFER_MS);
}

function notifyListeners(entry: SpanRegistry): void {
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
    cancelPendingUpFlip(entry);
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
 * Drop coordinator state for `parentSpanId` across both kinds.
 *
 * Called by the time-to-display integration once a transaction has been
 * processed, since the per-span coordinator state is no longer relevant
 * after the native draw timestamps have been read. Without this hook,
 * entries for screens that stay mounted past the end of their span
 * (React Navigation keep-alive, idle-timeout discarded transactions,
 * etc.) would accumulate in the module-level registries.
 *
 * Components that are still subscribed when their span is cleared remain
 * functional: their next interaction recreates the entry under the same
 * (now stale) parentSpanId. Since the integration has already read the
 * native ttid/ttfd values for that span, any subsequent fires are inert.
 */
export function clearSpan(parentSpanId: string): void {
  for (const kind of [TTID, TTFD] as const) {
    const entry = registries[kind].get(parentSpanId);
    if (entry) {
      cancelPendingUpFlip(entry);
      registries[kind].delete(parentSpanId);
    }
  }
}

/**
 * Test-only. Clears all coordinator state.
 */
export function _resetTimeToDisplayCoordinator(): void {
  for (const kind of [TTID, TTFD] as const) {
    for (const entry of registries[kind].values()) {
      cancelPendingUpFlip(entry);
    }
    registries[kind].clear();
  }
}
