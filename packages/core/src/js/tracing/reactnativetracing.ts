/* eslint-disable max-lines */
import { instrumentOutgoingRequests } from '@sentry/browser';
import type { Client, Event, Integration, StartSpanOptions } from '@sentry/core';
import { getClient } from '@sentry/core';

import { isWeb } from '../utils/environment';
import { getDevServer } from './../integrations/debugsymbolicatorutils';
import { addDefaultOpForSpanFrom, addThreadInfoToSpan, defaultIdleOptions } from './span';

export const INTEGRATION_NAME = 'ReactNativeTracing';

export interface ReactNativeTracingOptions {
  /**
   * The time that has to pass without any span being created.
   * If this time is exceeded, the idle span will finish.
   *
   * @default 1_000 (ms)
   */
  idleTimeoutMs?: number;

  /**
   * The max. time an idle span may run.
   * If this time is exceeded, the idle span will finish no matter what.
   *
   * @default 60_0000 (ms)
   */
  finalTimeoutMs?: number;

  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Fetch in React Native is a `whatwg-fetch` polyfill which uses XHR under the hood.
   * This causes duplicates when both `traceFetch` and `traceXHR` are enabled at the same time.
   *
   * @default false
   */
  traceFetch: boolean;

  /**
   * Flag to disable patching all together for xhr requests.
   *
   * @default true
   */
  traceXHR: boolean;

  /**
   * If true, Sentry will capture http timings and add them to the corresponding http spans.
   *
   * @default true
   */
  enableHTTPTimings: boolean;

  /**
   * A callback which is called before a span for a navigation is started.
   * It receives the options passed to `startSpan`, and expects to return an updated options object.
   */
  beforeStartSpan?: (options: StartSpanOptions) => StartSpanOptions;

  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * @default (url: string) => true
   */
  shouldCreateSpanForRequest?(this: void, url: string): boolean;
}

function getDefaultTracePropagationTargets(): RegExp[] | undefined {
  if (isWeb()) {
    return undefined;
  }
  return [/.*/];
}

export const defaultReactNativeTracingOptions: ReactNativeTracingOptions = {
  // Fetch in React Native is a `whatwg-fetch` polyfill which uses XHR under the hood.
  // This causes duplicates when both `traceFetch` and `traceXHR` are enabled at the same time.
  // https://github.com/facebook/react-native/blob/28945c68da056ab2ac01de7e542a845b2bca6096/packages/react-native/Libraries/Network/fetch.js
  // (RN Web uses browsers native fetch implementation)
  traceFetch: isWeb() ? true : false,
  traceXHR: true,
  enableHTTPTimings: true,
};

export type ReactNativeTracingState = {
  currentRoute: string | undefined;
};

export const reactNativeTracingIntegration = (
  options: Partial<ReactNativeTracingOptions> = {},
): Integration & {
  options: ReactNativeTracingOptions;
  state: ReactNativeTracingState;
  setCurrentRoute: (route: string) => void;
} => {
  const state: ReactNativeTracingState = {
    currentRoute: undefined,
  };

  const finalOptions = {
    ...defaultReactNativeTracingOptions,
    ...options,
    beforeStartSpan: options.beforeStartSpan ?? ((options: StartSpanOptions) => options),
    finalTimeoutMs: options.finalTimeoutMs ?? defaultIdleOptions.finalTimeout,
    idleTimeoutMs: options.idleTimeoutMs ?? defaultIdleOptions.idleTimeout,
  };

  const userShouldCreateSpanForRequest = finalOptions.shouldCreateSpanForRequest;

  // Drop Dev Server Spans
  const devServerUrl = getDevServer()?.url;
  const finalShouldCreateSpanForRequest =
    devServerUrl === undefined
      ? userShouldCreateSpanForRequest
      : (url: string): boolean => {
          if (url.startsWith(devServerUrl)) {
            return false;
          }
          if (userShouldCreateSpanForRequest) {
            return userShouldCreateSpanForRequest(url);
          }
          return true;
        };

  finalOptions.shouldCreateSpanForRequest = finalShouldCreateSpanForRequest;

  const setup = (client: Client): void => {
    addDefaultOpForSpanFrom(client);
    addThreadInfoToSpan(client);

    instrumentOutgoingRequests(client, {
      traceFetch: finalOptions.traceFetch,
      traceXHR: finalOptions.traceXHR,
      shouldCreateSpanForRequest: finalOptions.shouldCreateSpanForRequest,
      tracePropagationTargets: client.getOptions().tracePropagationTargets || getDefaultTracePropagationTargets(),
    });
  };

  const processEvent = (event: Event): Event => {
    if (event.contexts && state.currentRoute) {
      event.contexts.app = { view_names: [state.currentRoute], ...event.contexts.app };
    }
    return event;
  };

  return {
    name: INTEGRATION_NAME,
    setup,
    processEvent,
    options: finalOptions,
    state,
    setCurrentRoute: (route: string) => {
      state.currentRoute = route;
    },
  };
};

export type ReactNativeTracingIntegration = ReturnType<typeof reactNativeTracingIntegration>;

/**
 * Returns the current React Native Tracing integration.
 */
export function getCurrentReactNativeTracingIntegration(): ReactNativeTracingIntegration | undefined {
  const client = getClient();
  if (!client) {
    return undefined;
  }

  return getReactNativeTracingIntegration(client);
}

/**
 * Returns React Native Tracing integration of given client.
 */
export function getReactNativeTracingIntegration(client: Client): ReactNativeTracingIntegration | undefined {
  return client.getIntegrationByName(INTEGRATION_NAME) as ReactNativeTracingIntegration | undefined;
}
