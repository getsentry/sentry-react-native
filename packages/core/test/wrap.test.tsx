import { logger, setCurrentClient } from '@sentry/core';
import { render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import * as AppRegistry from '../src/js/integrations/appRegistry';
import { wrap } from '../src/js/sdk';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

describe('Sentry.wrap', () => {
  it('should not enforce any keys on the wrapped component', () => {
    const Mock: React.FC<{ test: 23 }> = () => <></>;
    const ActualWrapped = wrap(Mock);

    expect(typeof ActualWrapped.defaultProps).toBe(typeof Mock.defaultProps);
  });

  it('should wrap the component and init with a warning when getAppRegistryIntegration returns undefined', () => {
    logger.warn = jest.fn();
    const getAppRegistryIntegration = jest.spyOn(AppRegistry, 'getAppRegistryIntegration').mockReturnValueOnce(undefined);
    const Mock: React.FC = () => <Text>Test</Text>;
    const client = new TestClient(
      getDefaultTestClientOptions(),
    );
    setCurrentClient(client);

    client.init();
    const ActualWrapped = wrap(Mock);

    const { getByText } = render(<ActualWrapped />);

    expect(getAppRegistryIntegration).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('AppRegistryIntegration.onRunApplication not found or invalid.');
    expect(getByText('Test')).toBeTruthy();
  });
});
