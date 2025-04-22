import { logger, type DeviceContext, type Event, type Integration, type OsContext } from '@sentry/core';

import { isExpo, isExpoGo } from '../utils/environment';
import { getExpoDevice, getExpoUpdates } from '../utils/expomodules';
import { NATIVE } from '../wrapper';

const INTEGRATION_NAME = 'ExpoContext';

const CONTEXT_KEY = 'expo_updates';

/** Load device context from expo modules. */
export const expoContextIntegration = (): Integration => {
  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
  };
};

function setup(): void {
  setExpoUpdatesNativeContext();
}

function setExpoUpdatesNativeContext(): void {
  if (!isExpo() || isExpoGo()) {
    return;
  }

  const expoUpdates = getExpoUpdatesContext();

  try {
    // Ensures native errors and crashes have the same context as JS errors
    NATIVE.setContext(CONTEXT_KEY, expoUpdates);
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
  event.contexts[CONTEXT_KEY] = getExpoUpdatesContext();
}

function getExpoUpdatesContext(): Record<string, unknown> {
  const expoUpdates = getExpoUpdates();
  if (!expoUpdates) {
    return {
      isEnabled: false,
    };
  }

  const updatesContext: Record<string, unknown> = {
    is_enabled: !!expoUpdates.isEnabled,
    is_embedded_launch: !!expoUpdates.isEmbeddedLaunch,
    is_emergency_launch: !!expoUpdates.isEmergencyLaunch,
    is_using_embedded_assets: !!expoUpdates.isUsingEmbeddedAssets,
  };

  if (expoUpdates.updateId) {
    updatesContext.update_id = expoUpdates.updateId;
  }
  if (expoUpdates.channel) {
    updatesContext.channel = expoUpdates.channel;
  }
  if (expoUpdates.runtimeVersion) {
    updatesContext.runtime_version = expoUpdates.runtimeVersion;
  }
  if (expoUpdates.checkAutomatically) {
    updatesContext.check_automatically = expoUpdates.checkAutomatically;
  }
  if (expoUpdates.emergencyLaunchReason) {
    updatesContext.emergency_launch_reason = expoUpdates.emergencyLaunchReason;
  }
  if (expoUpdates.launchDuration) {
    updatesContext.launch_duration = expoUpdates.launchDuration;
  }
  if (expoUpdates.createdAt) {
    updatesContext.created_at = expoUpdates.createdAt;
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
