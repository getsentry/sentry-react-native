import { breadcrumbsIntegration as browserBreadcrumbsIntegration } from '@sentry/browser';
import type { Integration } from '@sentry/core';
import { isWeb } from '../utils/environment';

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
   * Enabled by default on web.
   *
   * Setting `fetch: true` and `xhr: true` will cause duplicates in React Native.
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
   * Because React Native global fetch is built on XMLHttpRequest,
   * this will also log `fetch` network requests.
   *
   * Setting `fetch: true` and `xhr: true` will cause duplicates in React Native.
   */
  xhr: boolean;
}

export const breadcrumbsIntegration = (options: Partial<BreadcrumbsOptions> = {}): Integration => {
  const _options: BreadcrumbsOptions = {
    // FIXME: In mobile environment XHR is implemented by native APIs, which are instrumented by the Native SDK.
    // This will cause duplicates in React Native. On iOS `NSURLSession` is instrumented by default. On Android
    // `OkHttp` is only instrumented by SAGP.
    xhr: true,
    console: true,
    sentry: true,
    ...options,
    fetch: options.fetch ?? (isWeb() ? true : false),
    dom: isWeb() ? options.dom ?? true : false,
    history: isWeb() ? options.history ?? true : false,
  };

  // Historically we had very little issue using the browser breadcrumbs integration
  // and thus we don't cherry pick the implementation like for example the Sentry Deno SDK does.
  // https://github.com/getsentry/sentry-javascript/blob/d007407c2e51d93d6d3933f9dea1e03ff3f4a4ab/packages/deno/src/integrations/breadcrumbs.ts#L34
  return browserBreadcrumbsIntegration(_options);
};
