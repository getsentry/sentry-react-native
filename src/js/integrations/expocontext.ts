import type { DeviceContext, Event, EventProcessor, Hub, Integration, OsContext } from '@sentry/types';

import { getExpoDevice } from '../utils/expomodules';

/** Load device context from expo modules. */
export class ExpoContext implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ExpoContext';

  /**
   * @inheritDoc
   */
  public name: string = ExpoContext.id;

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(ExpoContext);
      if (!self) {
        return event;
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

      return event;
    });
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
