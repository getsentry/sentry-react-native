import { graphqlClientIntegration as browserGraphqlClientIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';

interface GraphQLReactNativeIntegrationOptions {
  endpoints: Array<string | RegExp>;
}

/**
 * This integration ensures that GraphQL requests made in the React Native apps
 * have their GraphQL-specific data captured and attached to spans and breadcrumbs.
 */
export function graphqlIntegration(options: GraphQLReactNativeIntegrationOptions): Integration {
  return browserGraphqlClientIntegration({ endpoints: options.endpoints });
}
