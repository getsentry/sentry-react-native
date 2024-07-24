import { convertIntegrationFnToClass } from '@sentry/core';
import type {
  DeviceContext,
  Event,
  Integration,
  IntegrationClass,
  IntegrationFnResult,
  OsContext,
} from '@sentry/types';

import { getExpoDevice } from '../utils/expomodules';

const INTEGRATION_NAME = 'ExpoContext';

/** Load device context from expo modules. */
export const expoContextIntegration = (): IntegrationFnResult => {
  return {
    name: INTEGRATION_NAME,
    setupOnce: () => {
      // noop
    },
    processEvent,
  };
};

/**
 * Load device context from expo modules.
 *
 * @deprecated Use `expoContextIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const ExpoContext = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  expoContextIntegration,
) as IntegrationClass<Integration>;

function processEvent(event: Event): Event {
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

  return event;
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
