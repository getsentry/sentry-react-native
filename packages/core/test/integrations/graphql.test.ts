import { graphqlClientIntegration as browserGraphqlClientIntegration } from '@sentry/browser';
import { graphqlIntegration } from '../../src/js';

jest.mock('@sentry/browser', () => ({
  graphqlClientIntegration: jest.fn(() => ({ name: 'GraphQL' })),
}));

describe('GraphQL Integration', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('passes React Native options to browserGraphqlClientIntegration', () => {
    const result = graphqlIntegration({ endpoints: ['test'] });

    expect(browserGraphqlClientIntegration).toHaveBeenCalledWith({
      endpoints: ['test'],
    });
    expect(result).toBeDefined();
  });

  it('handles RegExp patterns', () => {
    const pattern = /graphql/;
    graphqlIntegration({ endpoints: [pattern] });

    expect(browserGraphqlClientIntegration).toHaveBeenCalledWith({
      endpoints: [pattern],
    });
  });
});
