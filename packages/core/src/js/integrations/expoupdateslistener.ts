import {
  addBreadcrumb,
  debug,
  type Integration,
  type SeverityLevel,
  type Span,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
  startInactiveSpan,
} from '@sentry/core';

import type { ReactNativeClient } from '../client';

import { SPAN_ORIGIN_AUTO_EXPO_UPDATES } from '../tracing/origin';
import { isExpo, isExpoGo } from '../utils/environment';

const INTEGRATION_NAME = 'ExpoUpdatesListener';

const BREADCRUMB_CATEGORY = 'expo.updates';

/**
 * Describes the state machine context from `expo-updates`.
 * We define our own minimal type to avoid a hard dependency on `expo-updates`.
 */
interface UpdatesNativeStateMachineContext {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
  isRestarting: boolean;
  latestManifest?: { id?: string };
  downloadedManifest?: { id?: string };
  rollback?: { commitTime: string };
  checkError?: Error;
  downloadError?: Error;
}

interface UpdatesNativeStateChangeEvent {
  context: UpdatesNativeStateMachineContext;
}

interface UpdatesStateChangeSubscription {
  remove(): void;
}

interface ExpoUpdatesExports {
  addUpdatesStateChangeListener: (
    listener: (event: UpdatesNativeStateChangeEvent) => void,
  ) => UpdatesStateChangeSubscription;
  latestContext: UpdatesNativeStateMachineContext;
}

/**
 * Tries to load `expo-updates` and retrieve exports needed by this integration.
 * Returns `undefined` if `expo-updates` is not installed.
 */
function getExpoUpdatesExports(): ExpoUpdatesExports | undefined {
  try {
    const expoUpdates = require('expo-updates') as Partial<ExpoUpdatesExports>;
    if (typeof expoUpdates.addUpdatesStateChangeListener === 'function') {
      return expoUpdates as ExpoUpdatesExports;
    }
  } catch (_) {
    // that happens when expo-updates is not installed
  }
  return undefined;
}

interface StateTransition {
  field: keyof UpdatesNativeStateMachineContext;
  message: string;
  level: SeverityLevel;
  getData?: (ctx: UpdatesNativeStateMachineContext) => Record<string, unknown> | undefined;
}

const STATE_TRANSITIONS: StateTransition[] = [
  { field: 'isChecking', message: 'Checking for update', level: 'info' },
  {
    field: 'isUpdateAvailable',
    message: 'Update available',
    level: 'info',
    getData: ctx => {
      const updateId = ctx.latestManifest?.id;
      return updateId ? { updateId } : undefined;
    },
  },
  { field: 'isDownloading', message: 'Downloading update', level: 'info' },
  {
    field: 'isUpdatePending',
    message: 'Update downloaded',
    level: 'info',
    getData: ctx => {
      const updateId = ctx.downloadedManifest?.id;
      return updateId ? { updateId } : undefined;
    },
  },
  {
    field: 'checkError',
    message: 'Update check failed',
    level: 'error',
    getData: ctx => ({
      error: (ctx.checkError as Error).message || String(ctx.checkError),
    }),
  },
  {
    field: 'downloadError',
    message: 'Update download failed',
    level: 'error',
    getData: ctx => ({
      error: (ctx.downloadError as Error).message || String(ctx.downloadError),
    }),
  },
  {
    field: 'rollback',
    message: 'Rollback directive received',
    level: 'warning',
    getData: ctx => ({
      commitTime: ctx.rollback!.commitTime,
    }),
  },
  { field: 'isRestarting', message: 'Restarting for update', level: 'info' },
];

/**
 * Listens to Expo Updates native state machine changes and records
 * breadcrumbs and spans for meaningful transitions such as checking
 * for updates, downloading updates, errors, rollbacks, and restarts.
 */
export const expoUpdatesListenerIntegration = (): Integration => {
  let subscription: UpdatesStateChangeSubscription | undefined;
  let checkSpan: Span | undefined;
  let downloadSpan: Span | undefined;

  function setup(client: ReactNativeClient): void {
    client.on('afterInit', () => {
      if (!isExpo() || isExpoGo()) {
        return;
      }

      const expoUpdates = getExpoUpdatesExports();
      if (!expoUpdates) {
        debug.log('[ExpoUpdatesListener] expo-updates is not available, skipping.');
        return;
      }

      // Clean up any previous state to prevent duplicates
      // if Sentry.init() is called multiple times.
      subscription?.remove();
      endSpanAsCancelled(checkSpan);
      checkSpan = undefined;
      endSpanAsCancelled(downloadSpan);
      downloadSpan = undefined;

      // Seed with the current state so that the first event does not
      // generate spurious breadcrumbs for already-truthy fields.
      let previousContext: Partial<UpdatesNativeStateMachineContext> = expoUpdates.latestContext ?? {};

      subscription = expoUpdates.addUpdatesStateChangeListener((event: UpdatesNativeStateChangeEvent) => {
        const ctx = event.context;
        const spanResult = handleSpanLifecycle(previousContext, ctx, checkSpan, downloadSpan);
        checkSpan = spanResult.checkSpan;
        downloadSpan = spanResult.downloadSpan;
        handleStateChange(previousContext, ctx);
        previousContext = ctx;
      });
    });

    client.on('close', () => {
      subscription?.remove();
      subscription = undefined;
      endSpanAsCancelled(checkSpan);
      checkSpan = undefined;
      endSpanAsCancelled(downloadSpan);
      downloadSpan = undefined;
    });
  }

  return {
    name: INTEGRATION_NAME,
    setup,
  };
};

function endSpanAsCancelled(span: Span | undefined): void {
  if (span) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: 'cancelled' });
    span.end();
  }
}

/**
 * Manages span lifecycle for check and download operations.
 * Starts spans when operations begin, ends them when they complete or fail.
 *
 * @internal Exposed for testing purposes
 */
export function handleSpanLifecycle(
  previous: Partial<UpdatesNativeStateMachineContext>,
  current: UpdatesNativeStateMachineContext,
  currentCheckSpan: Span | undefined,
  currentDownloadSpan: Span | undefined,
): { checkSpan: Span | undefined; downloadSpan: Span | undefined } {
  let checkSpan = currentCheckSpan;
  let downloadSpan = currentDownloadSpan;

  if (!previous.isChecking && current.isChecking) {
    checkSpan = startInactiveSpan({
      name: 'expo-updates check',
      op: 'app.update.check',
      forceTransaction: true,
      attributes: { 'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_UPDATES },
    });
  } else if (previous.isChecking && !current.isChecking && checkSpan) {
    endSpanWithResult(
      checkSpan,
      current.checkError,
      'check_error',
      current.isUpdateAvailable ? current.latestManifest?.id : undefined,
    );
    checkSpan = undefined;
  }

  if (!previous.isDownloading && current.isDownloading) {
    downloadSpan = startInactiveSpan({
      name: 'expo-updates download',
      op: 'app.update.download',
      forceTransaction: true,
      attributes: { 'sentry.origin': SPAN_ORIGIN_AUTO_EXPO_UPDATES },
    });
  } else if (previous.isDownloading && !current.isDownloading && downloadSpan) {
    endSpanWithResult(
      downloadSpan,
      current.downloadError,
      'download_error',
      current.isUpdatePending ? current.downloadedManifest?.id : undefined,
    );
    downloadSpan = undefined;
  }

  return { checkSpan, downloadSpan };
}

function endSpanWithResult(
  span: Span,
  error: Error | undefined,
  fallbackMessage: string,
  updateId: string | undefined,
): void {
  if (error) {
    span.setStatus({ code: SPAN_STATUS_ERROR, message: error.message || fallbackMessage });
  } else {
    span.setStatus({ code: SPAN_STATUS_OK });
    if (updateId) {
      span.setAttribute('expo.update.id', updateId);
    }
  }
  span.end();
}

/**
 * Compares previous and current state machine contexts and emits
 * breadcrumbs for meaningful transitions (falsy→truthy).
 *
 * @internal Exposed for testing purposes
 */
export function handleStateChange(
  previous: Partial<UpdatesNativeStateMachineContext>,
  current: UpdatesNativeStateMachineContext,
): void {
  for (const transition of STATE_TRANSITIONS) {
    if (!previous[transition.field] && current[transition.field]) {
      addBreadcrumb({
        category: BREADCRUMB_CATEGORY,
        message: transition.message,
        level: transition.level,
        data: transition.getData?.(current),
      });
    }
  }
}
