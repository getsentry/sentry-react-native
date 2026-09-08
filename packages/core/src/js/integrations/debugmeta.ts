import type { Event, Integration } from '@sentry/core';

import { getDebugMetadata } from '../profiling/debugid';

const INTEGRATION_NAME = 'DebugMeta';

/**
 * Adds `debug_meta.images` to error events based on the Debug ID injected by
 * Metro (`_sentryDebugIds`).
 *
 * React Native (Hermes) ships a single JS bundle per platform with a canonical
 * `code_file` (`app:///index.android.bundle` / `app:///main.jsbundle`). This
 * makes the direct Debug ID lookup used by profiling (`getDebugMetadata`) safe
 * to reuse for all error events.
 *
 * The core `prepareEvent` pipeline already attempts this via `applyDebugIds` ->
 * `applyDebugMeta`, but that path re-parses the premodule `Error().stack` and
 * requires an exact filename match against the exception frames, which is
 * fragile for Hermes premodule stacks. When it fails, events ship without
 * `debug_meta` and symbolication falls back to release + filename matching.
 *
 * Ordering matters: core runs `applyDebugIds` (which sets `frame.debug_id`)
 * *before* event processors, and `applyDebugMeta` (which turns those into
 * `debug_meta.images`) *after* them. This integration is an event processor, so
 * to stay idempotent it detects a successful core match via `frame.debug_id`
 * and backs off — otherwise core would append a second, identical image.
 */
export const debugMetaIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

function processEvent(event: Event): Event {
  // Only error/message events carry symbolicatable JS stack traces.
  // Transactions, profiles and other event types are handled elsewhere.
  if (event.type !== undefined) {
    return event;
  }

  // If core's `applyDebugIds` already matched the premodule stack, its frames
  // carry a `debug_id` and core will stamp `debug_meta.images` itself once event
  // processors have run. Backing off here avoids emitting a duplicate image.
  if (hasFrameWithDebugId(event)) {
    return event;
  }

  const images = getDebugMetadata();
  if (!images.length) {
    return event;
  }

  event.debug_meta = event.debug_meta || {};
  event.debug_meta.images = event.debug_meta.images || [];
  const existing = event.debug_meta.images;

  for (const image of images) {
    // Defensive dedupe against any image already present (e.g. from another
    // integration) so the same bundle is never listed twice.
    const alreadyPresent = existing.some(
      existingImage => 'debug_id' in existingImage && existingImage.debug_id === image.debug_id,
    );
    if (!alreadyPresent) {
      existing.push(image);
    }
  }

  return event;
}

function hasFrameWithDebugId(event: Event): boolean {
  return (
    event.exception?.values?.some(exception =>
      exception.stacktrace?.frames?.some(frame => frame.debug_id !== undefined),
    ) ?? false
  );
}
