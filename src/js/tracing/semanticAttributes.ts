// TODO: Export used RN Attributes and re-export JS

export {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';

export const SEMANTIC_ATTRIBUTE_ROUTING_INSTRUMENTATION = 'routing.instrumentation';
export const SEMANTIC_ATTRIBUTE_ROUTE_NAME = 'route.name';
export const SEMANTIC_ATTRIBUTE_ROUTE_KEY = 'route.key';
export const SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_ID = 'route.component_id';
export const SEMANTIC_ATTRIBUTE_ROUTE_COMPONENT_TYPE = 'route.component_type';
export const SEMANTIC_ATTRIBUTE_ROUTE_HAS_BEEN_SEEN = 'route.has_been_seen';
export const SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_NAME = 'previous_route.name';
export const SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_KEY = 'previous_route.key';
export const SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_ID = 'previous_route.component_id';
export const SEMANTIC_ATTRIBUTE_PREVIOUS_ROUTE_COMPONENT_TYPE = 'previous_route.component_type';
