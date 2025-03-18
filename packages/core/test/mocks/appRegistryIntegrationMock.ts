import * as AppRegistry from '../../src/js/integrations/appRegistry';

export const mockAppRegistryIntegration = () => {
  const mockedOnRunApplication = jest.fn();
  const mockedGetAppRegistryIntegration = jest.spyOn(AppRegistry, 'getAppRegistryIntegration').mockReturnValue({
    onRunApplication: mockedOnRunApplication,
    name: 'appRegistryIntegrationMocked',
  });

  return {
    mockedOnRunApplication,
    mockedGetAppRegistryIntegration,
  };
};
