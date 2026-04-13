import { getOriginalFunction } from '@sentry/core';

import { appRegistryIntegration } from '../../src/js/integrations/appRegistry';
import * as Environment from '../../src/js/utils/environment';
import { ReactNativeLibraries } from '../../src/js/utils/rnlibraries';

const originalAppRegistry = ReactNativeLibraries.AppRegistry;
const originalRunApplication = ReactNativeLibraries.AppRegistry.runApplication;

describe('AppRegistry Integration', () => {
  let mockedRunApplication: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRunApplication = jest.spyOn(ReactNativeLibraries.AppRegistry, 'runApplication').mockImplementation(jest.fn());
  });

  afterEach(() => {
    ReactNativeLibraries.AppRegistry = originalAppRegistry;
    ReactNativeLibraries.AppRegistry.runApplication = originalRunApplication;
  });

  it('does not patch app registry on init before setup', async () => {
    appRegistryIntegration();

    expect(getOriginalFunction(ReactNativeLibraries.AppRegistry.runApplication)).toBeUndefined();
    expect(ReactNativeLibraries.AppRegistry.runApplication).toBe(mockedRunApplication);
  });

  it('patches app registry on init after setup', async () => {
    appRegistryIntegration().setupOnce();

    expect(getOriginalFunction(ReactNativeLibraries.AppRegistry.runApplication)).toBeDefined();
    expect(ReactNativeLibraries.AppRegistry.runApplication).not.toBe(mockedRunApplication);
  });

  it('executes callbacks when runApplication is called', async () => {
    const firstMockedCallback = jest.fn();
    const secondMockedCallback = jest.fn();
    const integration = appRegistryIntegration();

    integration.setupOnce();
    integration.onRunApplication(firstMockedCallback);
    integration.onRunApplication(secondMockedCallback);

    ReactNativeLibraries.AppRegistry.runApplication('test-app', {});

    expect(firstMockedCallback).toHaveBeenCalled();
    expect(secondMockedCallback).toHaveBeenCalled();
  });

  it('registers and executes callback only once', async () => {
    const mockedCallback = jest.fn();
    const integration = appRegistryIntegration();

    integration.setupOnce();
    integration.onRunApplication(mockedCallback);
    integration.onRunApplication(mockedCallback);

    ReactNativeLibraries.AppRegistry.runApplication('test-app', {});

    expect(mockedCallback).toHaveBeenCalledTimes(1);
  });

  it('does not patch app registry on web', async () => {
    jest.spyOn(Environment, 'isWeb').mockReturnValue(true);
    const integration = appRegistryIntegration();

    integration.setupOnce();

    expect(ReactNativeLibraries.AppRegistry.runApplication).toBe(mockedRunApplication);
  });

  it('does not crash if AppRegistry is not available', async () => {
    ReactNativeLibraries.AppRegistry = undefined;
    const integration = appRegistryIntegration();

    integration.setupOnce();
  });
});
