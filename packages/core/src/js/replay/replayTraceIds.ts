import type { Event } from '@sentry/core';

import { NATIVE } from '../wrapper';

/**
 * Forwards the trace id seen on a sent event to the native Session Replay so the
 * current segment carries it under `trace_ids`, making the replay searchable by
 * trace id.
 *
 * Fires for any sent event that carries a trace (transactions and errors). The
 * native SDKs own dedup, the 100-per-segment cap, and the no-op when no replay
 * is recording; this is a thin forward. The `replayId` guard only avoids a
 * bridge crossing per event when nothing is recording — pass the currently
 * cached replay id (or `null` when there is none).
 */
export function registerReplayTraceIdForEvent(event: Event, replayId: string | null): void {
  const traceId = event.contexts?.trace?.trace_id;
  if (traceId && replayId) {
    NATIVE.registerReplayTraceId(traceId);
  }
}
