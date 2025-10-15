import { type DeviceContext, type Event, type Integration, type OsContext, logger } from '@sentry/core';

import type { ReactNativeClient } from '../client';
import { isExpo, isExpoGo } from '../utils/environment';
import { getExpoDevice, getExpoUpdates } from '../utils/expomodules';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'ExpoContext';

export const OTA_UPDATES_CONTEXT_KEY = 'ota_updates';

/** Load device context from expo modules. */
export const expoContextIntegration = (): Integration => {
  let _expoUpdatesContextCached: ExpoUpdatesContext | undefined;

  function setup(client: ReactNativeClient): void {
    client.on('afterInit', () => {
      if (!client.getOptions().enableNative) {
        return;
      }

      setExpoUpdatesNativeContext();
    });
  }

  function setExpoUpdatesNativeContext(): void {
    if (!isExpo() || isExpoGo()) {
      return;
    }

    const expoUpdates = getExpoUpdatesContextCached();

    try {
      // Ensures native errors and crashes have the same context as JS errors
      NATIVE.setContext(OTA_UPDATES_CONTEXT_KEY, expoUpdates);
    } catch (error) {
      logger.error('Error setting Expo updates context:', error);
    }
  }

  function processEvent(event: Event): Event {
    if (!isExpo()) {
      return event;
    }

    addExpoGoContext(event);
    addExpoUpdatesContext(event);
    return event;
  }

  function addExpoUpdatesContext(event: Event): void {
    event.contexts = event.contexts || {};
    event.contexts[OTA_UPDATES_CONTEXT_KEY] = {
      ...getExpoUpdatesContextCached(),
    };
  }

  function getExpoUpdatesContextCached(): ExpoUpdatesContext {
    if (_expoUpdatesContextCached) {
      return _expoUpdatesContextCached;
    }

    return (_expoUpdatesContextCached = getExpoUpdatesContext());
  }

  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
  };
};

/**
 * @internal Exposed for testing purposes
 */
export function getExpoUpdatesContext(): ExpoUpdatesContext {
  const expoUpdates = getExpoUpdates();
  if (!expoUpdates) {
    return {
      is_enabled: false,
    };
  }

  const updatesContext: ExpoUpdatesContext = {
    is_enabled: !!expoUpdates.isEnabled,
    is_embedded_launch: !!expoUpdates.isEmbeddedLaunch,
    is_emergency_launch: !!expoUpdates.isEmergencyLaunch,
    is_using_embedded_assets: !!expoUpdates.isUsingEmbeddedAssets,
  };

  if (typeof expoUpdates.updateId === 'string' && expoUpdates.updateId) {
    updatesContext.update_id = expoUpdates.updateId.toLowerCase();
  }
  if (typeof expoUpdates.channel === 'string' && expoUpdates.channel) {
    updatesContext.channel = expoUpdates.channel.toLowerCase();
  }
  if (typeof expoUpdates.runtimeVersion === 'string' && expoUpdates.runtimeVersion) {
    updatesContext.runtime_version = expoUpdates.runtimeVersion.toLowerCase();
  }
  if (typeof expoUpdates.checkAutomatically === 'string' && expoUpdates.checkAutomatically) {
    updatesContext.check_automatically = expoUpdates.checkAutomatically.toLowerCase();
  }
  if (typeof expoUpdates.emergencyLaunchReason === 'string' && expoUpdates.emergencyLaunchReason) {
    updatesContext.emergency_launch_reason = expoUpdates.emergencyLaunchReason;
  }
  if (typeof expoUpdates.launchDuration === 'number') {
    updatesContext.launch_duration = expoUpdates.launchDuration;
  }
  if (expoUpdates.createdAt instanceof Date) {
    updatesContext.created_at = expoUpdates.createdAt.toISOString();
  }
  return updatesContext;
}

function addExpoGoContext(event: Event): void {
  if (!isExpoGo()) {
    return;
  }

  const expoDeviceContext = getExpoDeviceContext();
  if (expoDeviceContext) {
    event.contexts = event.contexts || {};
    event.contexts.device = { ...expoDeviceContext, ...event.contexts.device };
  }

  const expoOsContext = getExpoOsContext();
  if (expoOsContext) {
    event.contexts = event.contexts || {};
    event.contexts.os = { ...expoOsContext, ...event.contexts.os };
  }
}

/**
 * Returns the Expo Device context if present
 */
function getExpoDeviceContext(): DeviceContext | undefined {
  const expoDevice = getExpoDevice();

  if (!expoDevice) {
    return undefined;
  }

  return {
    name: expoDevice.deviceName,
    simulator: !expoDevice?.isDevice,
    model: expoDevice.modelName,
    manufacturer: expoDevice.manufacturer,
    memory_size: expoDevice.totalMemory,
  };
}

/**
 * Returns the Expo OS context if present
 */
function getExpoOsContext(): OsContext | undefined {
  const expoDevice = getExpoDevice();

  if (!expoDevice) {
    return undefined;
  }

  return {
    build: expoDevice.osBuildId,
    version: expoDevice.osVersion,
    name: expoDevice.osName,
  };
}

type ExpoUpdatesContext = Partial<{
  is_enabled: boolean;
  is_embedded_launch: boolean;
  is_emergency_launch: boolean;
  is_using_embedded_assets: boolean;
  update_id: string;
  channel: string;
  runtime_version: string;
  check_automatically: string;
  emergency_launch_reason: string;
  launch_duration: number;
  created_at: string;
}>;
