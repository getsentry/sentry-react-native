import type { Hub } from '@sentry/core';
import type { Event } from '@sentry/types';

import { ExpoContext } from '../../src/js/integrations/expocontext';
import { getExpoDevice } from '../../src/js/utils/expomodules';

jest.mock('../../src/js/utils/expomodules');

describe('Expo Context Integration', () => {
  let integration: ExpoContext;

  const mockGetCurrentHub = () =>
    ({
      getIntegration: () => integration,
    } as unknown as Hub);

  beforeEach(() => {
    integration = new ExpoContext();
  });

  it('does not add device context because expo device module is not available', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue(undefined);
    const actualEvent = await executeIntegrationFor({});

    expect(actualEvent.contexts?.device).toBeUndefined();
  });

  it('does not add os context because expo device module is not available', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue(undefined);
    const actualEvent = await executeIntegrationFor({});

    expect(actualEvent.contexts?.os).toBeUndefined();
  });

  it('adds expo device context', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue({
      deviceName: 'test device name',
      isDevice: true,
      modelName: 'test model name',
      manufacturer: 'test manufacturer',
      totalMemory: 1000,
    });
    const actualEvent = await executeIntegrationFor({});

    expect(actualEvent.contexts?.device).toStrictEqual({
      name: 'test device name',
      simulator: false,
      model: 'test model name',
      manufacturer: 'test manufacturer',
      memory_size: 1000,
    });
  });

  it('adds expo os context', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue({
      osName: 'test os name',
      osBuildId: 'test os build id',
      osVersion: 'test os version',
    });
    const actualEvent = await executeIntegrationFor({});

    expect(actualEvent.contexts?.os).toStrictEqual({
      name: 'test os name',
      build: 'test os build id',
      version: 'test os version',
    });
  });

  function executeIntegrationFor(mockedEvent: Event): Promise<Event | null> {
    return new Promise((resolve, reject) => {
      integration.setupOnce(async eventProcessor => {
        try {
          const processedEvent = await eventProcessor(mockedEvent, {});
          resolve(processedEvent);
        } catch (e) {
          reject(e);
        }
      }, mockGetCurrentHub);
    });
  }
});
