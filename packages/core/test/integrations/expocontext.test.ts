import type { Client, Event } from '@sentry/core';

import { EXPO_UPDATES_CONTEXT_KEY, expoContextIntegration } from '../../src/js/integrations/expocontext';
import * as environment from '../../src/js/utils/environment';
import type { ExpoUpdates } from '../../src/js/utils/expoglobalobject';
import { getExpoDevice } from '../../src/js/utils/expomodules';
import * as expoModules from '../../src/js/utils/expomodules';

jest.mock('../../src/js/utils/expomodules');

describe('Expo Context Integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Non Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(false);
    });

    it('does not add expo updates context', async () => {
      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toBeUndefined();
    });
  });

  describe('In Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    });

    it('adds isEnabled false if ExpoUpdates module is missing', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue(undefined);

      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: false,
      });
    });

    it('adds all bool constants if ExpoUpdate module is empty', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({});

      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: false,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
      });
    });

    it('adds all non bool constants', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: '123',
        channel: 'default',
        runtimeVersion: '1.0.0',
        checkAutomatically: 'always',
        emergencyLaunchReason: 'some reason',
        launchDuration: 1000,
        createdAt: new Date('2021-01-01T00:00:00.000Z'),
      });

      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toEqual({
        is_enabled: false,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
        update_id: '123',
        channel: 'default',
        runtime_version: '1.0.0',
        check_automatically: 'always',
        emergency_launch_reason: 'some reason',
        launch_duration: 1000,
        created_at: '2021-01-01T00:00:00.000Z',
      });
    });

    it('avoids adding values of unexpected types', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: {},
        channel: {},
        runtimeVersion: {},
        checkAutomatically: {},
        emergencyLaunchReason: {},
        launchDuration: {},
        createdAt: {},
      } as unknown as ExpoUpdates);

      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: false,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
      });
    });
  });

  describe('In Expo Go', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(true);
    });

    it('does add expo updates context', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        isEnabled: true,
        isEmbeddedLaunch: false,
        updateId: '123',
        channel: 'default',
        runtimeVersion: '1.0.0',
      });

      const actualEvent = await executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: true,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
        update_id: '123',
        channel: 'default',
        runtime_version: '1.0.0',
      });
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
  });

  function executeIntegrationFor(mockedEvent: Event): Event {
    return expoContextIntegration().processEvent!(mockedEvent, {}, {} as Client) as Event;
  }
});
