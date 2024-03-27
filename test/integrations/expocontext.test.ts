import type { Client, Event } from '@sentry/types';

import { expoContextIntegration } from '../../src/js/integrations/expocontext';
import { getExpoDevice } from '../../src/js/utils/expomodules';

jest.mock('../../src/js/utils/expomodules');

describe('Expo Context Integration', () => {
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

  it('merge existing event device context with expo', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue({
      deviceName: 'test device name',
      simulator: true,
      modelName: 'test model name',
      manufacturer: 'test manufacturer',
      totalMemory: 1000,
    });
    const actualEvent = await executeIntegrationFor({
      contexts: {
        device: {
          name: 'existing device name',
        },
      },
    });

    expect(actualEvent.contexts?.device).toStrictEqual({
      name: 'existing device name',
      simulator: true,
      model: 'test model name',
      manufacturer: 'test manufacturer',
      memory_size: 1000,
    });
  });

  it('merge existing  event os context with expo', async () => {
    (getExpoDevice as jest.Mock).mockReturnValue({
      osName: 'test os name',
      osBuildId: 'test os build id',
      osVersion: 'test os version',
    });
    const actualEvent = await executeIntegrationFor({
      contexts: {
        os: {
          name: 'existing os name',
        },
      },
    });

    expect(actualEvent.contexts?.os).toStrictEqual({
      name: 'existing os name',
      build: 'test os build id',
      version: 'test os version',
    });
  });

  function executeIntegrationFor(mockedEvent: Event): Event {
    return expoContextIntegration().processEvent!(mockedEvent, {}, {} as Client) as Event;
  }
});
