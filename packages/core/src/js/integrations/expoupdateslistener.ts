import { addBreadcrumb, debug, type Integration } from '@sentry/core';
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

/**
 * Tries to load `expo-updates` and retrieve `addUpdatesStateChangeListener`.
 * Returns `undefined` if `expo-updates` is not installed.
 */
function getAddUpdatesStateChangeListener(): ((
  listener: (event: UpdatesNativeStateChangeEvent) => void,
) => UpdatesStateChangeSubscription) | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const expoUpdates = require('expo-updates');
    if (typeof expoUpdates.addUpdatesStateChangeListener === 'function') {
      return expoUpdates.addUpdatesStateChangeListener;
    }
  } catch (_) {
    // expo-updates is not installed
  }
  return undefined;
}

/**
 * Listens to Expo Updates native state machine changes and records
 * breadcrumbs for meaningful transitions such as checking for updates,
 * downloading updates, errors, rollbacks, and restarts.
 */
export const expoUpdatesListenerIntegration = (): Integration => {
  let _subscription: UpdatesStateChangeSubscription | undefined;

  function setup(client: ReactNativeClient): void {
    client.on('afterInit', () => {
      if (!isExpo() || isExpoGo()) {
        return;
      }

      const addListener = getAddUpdatesStateChangeListener();
      if (!addListener) {
        debug.log('[ExpoUpdatesListener] expo-updates is not available, skipping.');
        return;
      }

      let previousContext: Partial<UpdatesNativeStateMachineContext> = {};

      _subscription = addListener((event: UpdatesNativeStateChangeEvent) => {
        const ctx = event.context;
        handleStateChange(previousContext, ctx);
        previousContext = ctx;
      });
    });
  }

  return {
    name: INTEGRATION_NAME,
    setup,
  };
};

/**
 * Compares previous and current state machine contexts and emits
 * breadcrumbs for meaningful transitions.
 *
 * @internal Exposed for testing purposes
 */
export function handleStateChange(
  previous: Partial<UpdatesNativeStateMachineContext>,
  current: UpdatesNativeStateMachineContext,
): void {
  // Checking for update
  if (!previous.isChecking && current.isChecking) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Checking for update',
      level: 'info',
    });
  }

  // Update available
  if (!previous.isUpdateAvailable && current.isUpdateAvailable) {
    const updateId = current.latestManifest?.id;
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Update available',
      level: 'info',
      data: updateId ? { updateId } : undefined,
    });
  }

  // Downloading update
  if (!previous.isDownloading && current.isDownloading) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Downloading update',
      level: 'info',
    });
  }

  // Update downloaded and pending
  if (!previous.isUpdatePending && current.isUpdatePending) {
    const updateId = current.downloadedManifest?.id;
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Update downloaded',
      level: 'info',
      data: updateId ? { updateId } : undefined,
    });
  }

  // Check error
  if (!previous.checkError && current.checkError) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Update check failed',
      level: 'error',
      data: {
        error: current.checkError.message || String(current.checkError),
      },
    });
  }

  // Download error
  if (!previous.downloadError && current.downloadError) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Update download failed',
      level: 'error',
      data: {
        error: current.downloadError.message || String(current.downloadError),
      },
    });
  }

  // Rollback
  if (!previous.rollback && current.rollback) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Rollback directive received',
      level: 'warning',
      data: {
        commitTime: current.rollback.commitTime,
      },
    });
  }

  // Restarting
  if (!previous.isRestarting && current.isRestarting) {
    addBreadcrumb({
      category: BREADCRUMB_CATEGORY,
      message: 'Restarting for update',
      level: 'info',
    });
  }
}
