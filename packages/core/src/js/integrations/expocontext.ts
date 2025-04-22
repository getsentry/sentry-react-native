import type { DeviceContext, Event, Integration, OsContext } from '@sentry/core';

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
  const expoUpdates = getExpoUpdatesContext();
  // Ensures native errors and crashes have the same context as JS errors
  NATIVE.setContext(CONTEXT_KEY, expoUpdates);
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
    isEnabled: !!expoUpdates.isEnabled,
    isEmbeddedLaunch: !!expoUpdates.isEmbeddedLaunch,
    isEmergencyLaunch: !!expoUpdates.isEmergencyLaunch,
    isUsingEmbeddedAssets: !!expoUpdates.isUsingEmbeddedAssets,
  };

  if (expoUpdates.updateId) {
    updatesContext.updateId = expoUpdates.updateId;
  }
  if (expoUpdates.channel) {
    updatesContext.channel = expoUpdates.channel;
  }
  if (expoUpdates.runtimeVersion) {
    updatesContext.runtimeVersion = expoUpdates.runtimeVersion;
  }
  if (expoUpdates.checkAutomatically) {
    updatesContext.checkAutomatically = expoUpdates.checkAutomatically;
  }
  if (expoUpdates.emergencyLaunchReason) {
    updatesContext.emergencyLaunchReason = expoUpdates.emergencyLaunchReason;
  }
  if (expoUpdates.launchDuration) {
    updatesContext.launchDuration = expoUpdates.launchDuration;
  }
  if (expoUpdates.createdAt) {
    updatesContext.createdAt = expoUpdates.createdAt;
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
