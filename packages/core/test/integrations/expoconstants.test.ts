import type { Client, Event } from '@sentry/core';

import type { ExpoConstants } from '../../src/js/utils/expoglobalobject';

import {
  EXPO_CONSTANTS_CONTEXT_KEY,
  expoConstantsIntegration,
  getExpoConstantsContext,
} from '../../src/js/integrations/expoconstants';
import * as environment from '../../src/js/utils/environment';
import * as expoModules from '../../src/js/utils/expomodules';

jest.mock('../../src/js/utils/expomodules');

describe('Expo Constants Integration', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Non Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(false);
    });

    it('does not add expo constants context', () => {
      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toBeUndefined();
    });
  });

  describe('In Expo App', () => {
    beforeEach(() => {
      jest.spyOn(environment, 'isExpo').mockReturnValue(true);
    });

    it('only calls getExpoConstants once', () => {
      const getExpoConstantsMock = jest.spyOn(expoModules, 'getExpoConstants');

      const integration = expoConstantsIntegration();
      integration.processEvent!({}, {}, {} as Client);
      integration.processEvent!({}, {}, {} as Client);

      expect(getExpoConstantsMock).toHaveBeenCalledTimes(1);
    });

    it('added context does not share the same reference', async () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({});

      const integration = expoConstantsIntegration();
      const event1 = await integration.processEvent!({}, {}, {} as Client);
      const event2 = await integration.processEvent!({}, {}, {} as Client);

      expect(event1.contexts![EXPO_CONSTANTS_CONTEXT_KEY]).not.toBe(event2.contexts![EXPO_CONSTANTS_CONTEXT_KEY]);
    });

    it('adds empty context if ExpoConstants module is missing', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue(undefined);

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toStrictEqual({});
    });

    it('adds empty context if ExpoConstants module is empty', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({});

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toStrictEqual({});
    });

    it('adds all constants', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        executionEnvironment: 'standalone',
        appOwnership: 'expo',
        debugMode: true,
        expoVersion: '51.0.0',
        expoRuntimeVersion: '1.0.0',
        sessionId: 'test-session-id',
        statusBarHeight: 44,
        expoConfig: {
          name: 'TestApp',
          slug: 'test-app',
          version: '1.0.0',
          sdkVersion: '51.0.0',
        },
        easConfig: {
          projectId: 'test-project-id',
        },
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toEqual({
        execution_environment: 'standalone',
        app_ownership: 'expo',
        debug_mode: true,
        expo_version: '51.0.0',
        expo_runtime_version: '1.0.0',
        session_id: 'test-session-id',
        status_bar_height: 44,
        app_name: 'TestApp',
        app_slug: 'test-app',
        app_version: '1.0.0',
        expo_sdk_version: '51.0.0',
        eas_project_id: 'test-project-id',
      });
    });

    it('adds partial constants when only some are available', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        executionEnvironment: 'bare',
        debugMode: false,
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toEqual({
        execution_environment: 'bare',
        debug_mode: false,
      });
    });

    it('avoids adding values of unexpected types', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        executionEnvironment: 123,
        appOwnership: {},
        debugMode: 'true',
        expoVersion: {},
        sessionId: {},
        statusBarHeight: 'not a number',
      } as unknown as ExpoConstants);

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toStrictEqual({});
    });

    it('avoids adding empty string values', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        executionEnvironment: '',
        appOwnership: '',
        expoVersion: '',
        expoRuntimeVersion: '',
        sessionId: '',
        expoConfig: {
          name: '',
          slug: '',
          version: '',
          sdkVersion: '',
        },
        easConfig: {
          projectId: '',
        },
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toStrictEqual({});
    });

    it('handles null config values', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        executionEnvironment: 'standalone',
        expoConfig: null,
        easConfig: null,
      });

      const actualEvent = executeIntegrationFor({});

      expect(actualEvent.contexts?.[EXPO_CONSTANTS_CONTEXT_KEY]).toEqual({
        execution_environment: 'standalone',
      });
    });
  });

  describe('getExpoConstantsContext', () => {
    it('returns empty object when constants module is missing', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue(undefined);

      const context = getExpoConstantsContext();

      expect(context).toStrictEqual({});
    });

    it('does not add null values', () => {
      jest.spyOn(expoModules, 'getExpoConstants').mockReturnValue({
        appOwnership: null,
        expoVersion: null,
        expoRuntimeVersion: null,
      });

      const context = getExpoConstantsContext();

      expect(context).toStrictEqual({});
    });
  });

  function executeIntegrationFor(mockedEvent: Event): Event {
    return expoConstantsIntegration().processEvent!(mockedEvent, {}, {} as Client) as Event;
  }
});
