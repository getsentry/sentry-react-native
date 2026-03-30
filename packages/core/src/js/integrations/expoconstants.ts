import type { Event, Integration } from '@sentry/core';

import type { ExpoConstants } from '../utils/expoglobalobject';

import { isExpo } from '../utils/environment';
import { getExpoConstants } from '../utils/expomodules';

const INTEGRATION_NAME = 'ExpoConstants';

export const EXPO_CONSTANTS_CONTEXT_KEY = 'expo_constants';

/** Load Expo Constants as event context. */
export const expoConstantsIntegration = (): Integration => {
  let _expoConstantsContextCached: ExpoConstantsContext | undefined;

  function processEvent(event: Event): Event {
    if (!isExpo()) {
      return event;
    }

    event.contexts = event.contexts || {};
    event.contexts[EXPO_CONSTANTS_CONTEXT_KEY] = {
      ...getExpoConstantsContextCached(),
    };

    return event;
  }

  function getExpoConstantsContextCached(): ExpoConstantsContext {
    if (_expoConstantsContextCached) {
      return _expoConstantsContextCached;
    }

    return (_expoConstantsContextCached = getExpoConstantsContext());
  }

  return {
    name: INTEGRATION_NAME,
    processEvent,
  };
};

/**
 * @internal Exposed for testing purposes
 */
export function getExpoConstantsContext(): ExpoConstantsContext {
  const expoConstants = getExpoConstants();
  if (!expoConstants) {
    return {};
  }

  const context: ExpoConstantsContext = {};

  addStringField(context, 'execution_environment', expoConstants.executionEnvironment);
  addStringField(context, 'app_ownership', expoConstants.appOwnership);
  addBooleanField(context, 'debug_mode', expoConstants.debugMode);
  addStringField(context, 'expo_version', expoConstants.expoVersion);
  addStringField(context, 'expo_runtime_version', expoConstants.expoRuntimeVersion);
  addStringField(context, 'session_id', expoConstants.sessionId);
  addNumberField(context, 'status_bar_height', expoConstants.statusBarHeight);

  addExpoConfigFields(context, expoConstants);
  addEasConfigFields(context, expoConstants);

  return context;
}

function addStringField(
  context: ExpoConstantsContext,
  key: keyof ExpoConstantsContext,
  value: string | null | undefined,
): void {
  if (typeof value === 'string' && value) {
    (context as Record<string, unknown>)[key] = value;
  }
}

function addBooleanField(
  context: ExpoConstantsContext,
  key: keyof ExpoConstantsContext,
  value: boolean | undefined,
): void {
  if (typeof value === 'boolean') {
    (context as Record<string, unknown>)[key] = value;
  }
}

function addNumberField(
  context: ExpoConstantsContext,
  key: keyof ExpoConstantsContext,
  value: number | undefined,
): void {
  if (typeof value === 'number') {
    (context as Record<string, unknown>)[key] = value;
  }
}

function addExpoConfigFields(context: ExpoConstantsContext, expoConstants: ExpoConstants): void {
  if (!expoConstants.expoConfig) {
    return;
  }

  addStringField(context, 'app_name', expoConstants.expoConfig.name);
  addStringField(context, 'app_slug', expoConstants.expoConfig.slug);
  addStringField(context, 'app_version', expoConstants.expoConfig.version);
  addStringField(context, 'expo_sdk_version', expoConstants.expoConfig.sdkVersion);
}

function addEasConfigFields(context: ExpoConstantsContext, expoConstants: ExpoConstants): void {
  if (!expoConstants.easConfig) {
    return;
  }

  addStringField(context, 'eas_project_id', expoConstants.easConfig.projectId);
}

type ExpoConstantsContext = Partial<{
  execution_environment: string;
  app_ownership: string;
  debug_mode: boolean;
  expo_version: string;
  expo_runtime_version: string;
  session_id: string;
  status_bar_height: number;
  app_name: string;
  app_slug: string;
  app_version: string;
  expo_sdk_version?: string;
  eas_project_id: string;
}>;
