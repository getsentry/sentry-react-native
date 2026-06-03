import type { Integration } from '@sentry/core';

import { breadcrumbsIntegration as browserBreadcrumbsIntegration } from '@sentry/browser';

import { isExpoFetchEnabled, isWeb } from '../utils/environment';

interface BreadcrumbsOptions {
  /**
   * Log calls to console.log, console.debug, and so on.
   */
  console: boolean;

  /**
   * Log all click and keypress events.
   *
   * Only available on web. In React Native this is a no-op.
   */
  dom:
    | boolean
    | {
        serializeAttribute?: string | string[];
        maxStringLength?: number;
      };

  /**
   * Log HTTP requests done with the global Fetch API.
   *
   * Disabled by default in React Native because fetch is built on XMLHttpRequest.
   * Enabled by default on web and when Expo's native fetch (`expo/fetch`) is active.
   *
   * Setting `fetch: true` and `xhr: true` will cause duplicates in React Native
   * when using the default XHR-based fetch polyfill.
   */
  fetch: boolean;

  /**
   * Log calls to history.pushState and related APIs.
   *
   * Only available on web. In React Native this is a no-op.
   */
  history: boolean;

  /**
   * Log whenever we send an event to the server.
   */
  sentry: boolean;

  /**
   * Log HTTP requests done with the XHR API.
   *
   * In standard React Native, fetch is built on XMLHttpRequest,
   * so XHR breadcrumbs also capture fetch requests.
   * When Expo's native fetch (`expo/fetch`) is active, XHR does not
   * capture fetch requests — both `fetch` and `xhr` can be enabled
   * without duplicates.
   */
  xhr: boolean;
}

export const breadcrumbsIntegration = (options: Partial<BreadcrumbsOptions> = {}): Integration => {
  const _options: BreadcrumbsOptions = {
    // In mobile environment XHR is implemented by native APIs, which are instrumented by the Native SDK.
    // Duplicates from JS and native HTTP breadcrumbs are deduplicated in `deviceContextIntegration`.
    xhr: true,
    console: true,
    sentry: true,
    ...options,
    fetch: options.fetch ?? (isWeb() || isExpoFetchEnabled()),
    dom: isWeb() ? (options.dom ?? true) : false,
    history: isWeb() ? (options.history ?? true) : false,
  };

  // Historically we had very little issue using the browser breadcrumbs integration
  // and thus we don't cherry pick the implementation like for example the Sentry Deno SDK does.
  // https://github.com/getsentry/sentry-javascript/blob/d007407c2e51d93d6d3933f9dea1e03ff3f4a4ab/packages/deno/src/integrations/breadcrumbs.ts#L34
  return browserBreadcrumbsIntegration(_options);
};
