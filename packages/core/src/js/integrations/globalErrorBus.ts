/**
 * Global error bus used by {@link GlobalErrorBoundary} to receive errors that
 * are captured outside the React render tree (e.g. `ErrorUtils` fatals,
 * unhandled promise rejections).
 *
 * The bus is intentionally tiny and stored on the global object so that it
 * survives Fast Refresh during development.
 *
 * This module is internal to the SDK.
 */

import { RN_GLOBAL_OBJ } from '../utils/worldwide';

/** Where the error came from. */
export type GlobalErrorKind = 'onerror' | 'onunhandledrejection';

/** Payload delivered to subscribers. */
export interface GlobalErrorEvent {
  error: unknown;
  isFatal: boolean;
  kind: GlobalErrorKind;
}

/** Options describing which kinds of errors a subscriber wants. */
export interface GlobalErrorSubscriberOptions {
  /** Receive fatal `ErrorUtils` errors. Defaults to true. */
  fatal?: boolean;
  /** Receive non-fatal `ErrorUtils` errors. Defaults to false. */
  nonFatal?: boolean;
  /** Receive unhandled promise rejections. Defaults to false. */
  unhandledRejection?: boolean;
}

type Listener = (event: GlobalErrorEvent) => void;

interface Subscriber {
  listener: Listener;
  options: Required<GlobalErrorSubscriberOptions>;
}

interface BusState {
  subscribers: Set<Subscriber>;
}

interface GlobalWithBus {
  __SENTRY_RN_GLOBAL_ERROR_BUS__?: BusState;
}

function getBus(): BusState {
  const host = RN_GLOBAL_OBJ as unknown as GlobalWithBus;
  if (!host.__SENTRY_RN_GLOBAL_ERROR_BUS__) {
    host.__SENTRY_RN_GLOBAL_ERROR_BUS__ = { subscribers: new Set() };
  }
  return host.__SENTRY_RN_GLOBAL_ERROR_BUS__;
}

/**
 * Subscribe to global errors. Returns an unsubscribe function.
 */
export function subscribeGlobalError(listener: Listener, options: GlobalErrorSubscriberOptions = {}): () => void {
  const subscriber: Subscriber = {
    listener,
    options: {
      fatal: options.fatal ?? true,
      nonFatal: options.nonFatal ?? false,
      unhandledRejection: options.unhandledRejection ?? false,
    },
  };
  getBus().subscribers.add(subscriber);
  return () => {
    getBus().subscribers.delete(subscriber);
  };
}

/**
 * Returns true if at least one subscriber is interested in the given event.
 *
 * Used by the error handlers integration to decide whether to skip invoking
 * React Native's default error handler (which would otherwise tear down the
 * JS context and prevent any fallback UI from rendering).
 */
export function hasInterestedSubscribers(kind: GlobalErrorKind, isFatal: boolean): boolean {
  for (const { options } of getBus().subscribers) {
    if (kind === 'onerror') {
      if (isFatal ? options.fatal : options.nonFatal) return true;
    } else if (kind === 'onunhandledrejection' && options.unhandledRejection) {
      return true;
    }
  }
  return false;
}

/**
 * Publish a global error to all interested subscribers.
 */
export function publishGlobalError(event: GlobalErrorEvent): void {
  for (const { listener, options } of getBus().subscribers) {
    if (event.kind === 'onerror') {
      if (event.isFatal ? options.fatal : options.nonFatal) listener(event);
    } else if (event.kind === 'onunhandledrejection' && options.unhandledRejection) {
      listener(event);
    }
  }
}

/** Test-only: clear all subscribers. */
export function _resetGlobalErrorBus(): void {
  getBus().subscribers.clear();
}
