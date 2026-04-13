import { addBreadcrumb, debug, type Integration, type SeverityLevel } from '@sentry/core';

import type { ReactNativeClient } from '../client';

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
 * breadcrumbs for meaningful transitions such as checking for updates,
 * downloading updates, errors, rollbacks, and restarts.
 */
export const expoUpdatesListenerIntegration = (): Integration => {
  let subscription: UpdatesStateChangeSubscription | undefined;

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

      // Remove any previous subscription to prevent duplicate breadcrumbs
      // if Sentry.init() is called multiple times.
      subscription?.remove();

      // Seed with the current state so that the first event does not
      // generate spurious breadcrumbs for already-truthy fields.
      let previousContext: Partial<UpdatesNativeStateMachineContext> = expoUpdates.latestContext ?? {};

      subscription = expoUpdates.addUpdatesStateChangeListener((event: UpdatesNativeStateChangeEvent) => {
        const ctx = event.context;
        handleStateChange(previousContext, ctx);
        previousContext = ctx;
      });
    });

    client.on('close', () => {
      subscription?.remove();
      subscription = undefined;
    });
  }

  return {
    name: INTEGRATION_NAME,
    setup,
  };
};

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
