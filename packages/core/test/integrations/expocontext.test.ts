import { type Client, type Event, getCurrentScope, getGlobalScope, getIsolationScope } from '@sentry/core';

import {
  expoContextIntegration,
  getExpoUpdatesContext,
  OTA_UPDATES_CONTEXT_KEY,
} from '../../src/js/integrations/expocontext';
import * as environment from '../../src/js/utils/environment';
import type { ExpoUpdates } from '../../src/js/utils/expoglobalobject';
import { getExpoDevice } from '../../src/js/utils/expomodules';
import * as expoModules from '../../src/js/utils/expomodules';
import { setupTestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('../../src/js/utils/expomodules');

describe('Expo Context Integration', () => {
  afterEach(() => {
    jest.clearAllMocks();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();
  });

  describe('Set Native Context after init()', () => {
    beforeEach(() => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: '123',
        channel: 'default',
        runtimeVersion: '1.0.0',
        checkAutomatically: 'always',
        emergencyLaunchReason: 'some reason',
        launchDuration: 1000,
        createdAt: new Date('2021-01-01T00:00:00.000Z'),
      });
    });

    it('calls setContext when native enabled', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      setupTestClient({ enableNative: true, integrations: [expoContextIntegration()] });

      expect(NATIVE.setContext).toHaveBeenCalledWith(
        OTA_UPDATES_CONTEXT_KEY,
        expect.objectContaining({
          update_id: '123',
          channel: 'default',
          runtime_version: '1.0.0',
        }),
      );
    });

    it('does not call setContext when native disabled', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      setupTestClient({ enableNative: false, integrations: [expoContextIntegration()] });

      expect(NATIVE.setContext).not.toHaveBeenCalled();
    });

    it('does not call setContext when not expo', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(false);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);

      setupTestClient({ enableNative: true, integrations: [expoContextIntegration()] });

      expect(NATIVE.setContext).not.toHaveBeenCalled();
    });

    it('does not call setContext when expo go', () => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(true);

      setupTestClient({ enableNative: true, integrations: [expoContextIntegration()] });

      expect(NATIVE.setContext).not.toHaveBeenCalled();
    });
  });

  describe('Non Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(false);
    });

    it('does not add expo updates context', () => {
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toBeUndefined();
    });
  });

  describe('In Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
      jest.spyOn(environment, 'isExpoGo').mockReturnValue(false);
    });

    it('only calls getExpoUpdates once', () => {
      const getExpoUpdatesMock = jest.spyOn(expoModules, 'getExpoUpdates');

      const integration = expoContextIntegration();
      integration.processEvent!({}, {}, {} as Client);
      integration.processEvent!({}, {}, {} as Client);

      expect(getExpoUpdatesMock).toHaveBeenCalledTimes(1);
    });

    it('added context does not share the same reference', async () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({});

      const integration = expoContextIntegration();
      const event1 = await integration.processEvent!({}, {}, {} as Client);
      const event2 = await integration.processEvent!({}, {}, {} as Client);

      expect(event1.contexts![OTA_UPDATES_CONTEXT_KEY]).not.toBe(event2.contexts![OTA_UPDATES_CONTEXT_KEY]);
    });

    it('adds isEnabled false if ExpoUpdates module is missing', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue(undefined);

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: false,
      });
    });

    it('adds all bool constants if ExpoUpdate module is empty', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({});

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: false,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
      });
    });

    it('adds all non bool constants', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: '123',
        channel: 'default',
        runtimeVersion: '1.0.0',
        checkAutomatically: 'always',
        emergencyLaunchReason: 'some reason',
        launchDuration: 1000,
        createdAt: new Date('2021-01-01T00:00:00.000Z'),
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toEqual({
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

    it('avoids adding values of unexpected types', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: {},
        channel: {},
        runtimeVersion: {},
        checkAutomatically: {},
        emergencyLaunchReason: {},
        launchDuration: {},
        createdAt: {},
      } as unknown as ExpoUpdates);

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toStrictEqual({
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

    it('does add expo updates context', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        isEnabled: true,
        isEmbeddedLaunch: false,
        updateId: '123',
        channel: 'default',
        runtimeVersion: '1.0.0',
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[OTA_UPDATES_CONTEXT_KEY]).toStrictEqual({
        is_enabled: true,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
        update_id: '123',
        channel: 'default',
        runtime_version: '1.0.0',
      });
    });

    it('does not add device context because expo device module is not available', () => {
      (getExpoDevice as jest.Mock).mockReturnValue(undefined);
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.device).toBeUndefined();
    });

    it('does not add os context because expo device module is not available', () => {
      (getExpoDevice as jest.Mock).mockReturnValue(undefined);
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.os).toBeUndefined();
    });

    it('adds expo device context', () => {
      (getExpoDevice as jest.Mock).mockReturnValue({
        deviceName: 'test device name',
        isDevice: true,
        modelName: 'test model name',
        manufacturer: 'test manufacturer',
        totalMemory: 1000,
      });
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.device).toStrictEqual({
        name: 'test device name',
        simulator: false,
        model: 'test model name',
        manufacturer: 'test manufacturer',
        memory_size: 1000,
      });
    });

    it('adds expo os context', () => {
      (getExpoDevice as jest.Mock).mockReturnValue({
        osName: 'test os name',
        osBuildId: 'test os build id',
        osVersion: 'test os version',
      });
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.os).toStrictEqual({
        name: 'test os name',
        build: 'test os build id',
        version: 'test os version',
      });
    });

    it('merge existing event device context with expo', () => {
      (getExpoDevice as jest.Mock).mockReturnValue({
        deviceName: 'test device name',
        simulator: true,
        modelName: 'test model name',
        manufacturer: 'test manufacturer',
        totalMemory: 1000,
      });
      const actualEvent = executeIntegrationFor({
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

    it('merge existing  event os context with expo', () => {
      (getExpoDevice as jest.Mock).mockReturnValue({
        osName: 'test os name',
        osBuildId: 'test os build id',
        osVersion: 'test os version',
      });
      const actualEvent = executeIntegrationFor({
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

  describe('getExpoUpdatesContext', () => {
    it('does not return empty values', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        isEnabled: false,
        isEmbeddedLaunch: false,
        isEmergencyLaunch: false,
        isUsingEmbeddedAssets: false,
        updateId: '',
        channel: '',
        runtimeVersion: '',
        checkAutomatically: '',
        emergencyLaunchReason: '',
        launchDuration: 0,
        createdAt: new Date('2021-01-01T00:00:00.000Z'),
      });

      const expoUpdates = getExpoUpdatesContext();

      expect(expoUpdates).toStrictEqual({
        is_enabled: false,
        is_embedded_launch: false,
        is_emergency_launch: false,
        is_using_embedded_assets: false,
        launch_duration: 0,
        created_at: '2021-01-01T00:00:00.000Z',
      });
    });

    it('lowercases all string values', () => {
      jest.spyOn(expoModules, 'getExpoUpdates').mockReturnValue({
        updateId: 'UPPERCASE-123',
        channel: 'UPPERCASE-123',
        runtimeVersion: 'UPPERCASE-123',
        checkAutomatically: 'UPPERCASE-123',
        emergencyLaunchReason: 'This is a description of the reason.',
        createdAt: new Date('2021-01-01T00:00:00.000Z'),
      });

      const expoUpdates = getExpoUpdatesContext();

      expect(expoUpdates).toEqual(
        expect.objectContaining({
          update_id: 'uppercase-123',
          channel: 'uppercase-123',
          runtime_version: 'uppercase-123',
          check_automatically: 'uppercase-123',
          emergency_launch_reason: 'This is a description of the reason.', // Description should be kept as is
          created_at: '2021-01-01T00:00:00.000Z', // Date should keep ISO string format
        }),
      );
    });
  });

  function executeIntegrationFor(mockedEvent: Event): Event {
    return expoContextIntegration().processEvent!(mockedEvent, {}, {} as Client) as Event;
  }
});
