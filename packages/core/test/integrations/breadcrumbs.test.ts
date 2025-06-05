import { breadcrumbsIntegration as browserBreadcrumbsIntegration } from '@sentry/browser';
import { breadcrumbsIntegration } from '../../src/js/integrations/breadcrumbs';
import * as environment from '../../src/js/utils/environment';

jest.mock('@sentry/browser', () => ({
  breadcrumbsIntegration: jest.fn(),
}));

describe('breadcrumbsIntegration', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('passes React Native defaults to browserBreadcrumbsIntegration', () => {
    jest.spyOn(environment, 'isWeb').mockReturnValue(false);

    breadcrumbsIntegration();

    expect(browserBreadcrumbsIntegration).toHaveBeenCalledWith({
      xhr: true,
      console: true,
      sentry: true,
      dom: false, // DOM is not available in React Native
      fetch: false, // fetch is built on XMLHttpRequest in React Native
      history: false, // history is not available in React Native
    });
  });

  it('passes web defaults to browserBreadcrumbsIntegration when isWeb returns true', () => {
    jest.spyOn(environment, 'isWeb').mockReturnValue(true);

    breadcrumbsIntegration();

    expect(browserBreadcrumbsIntegration).toHaveBeenCalledWith({
      // Everything is enabled by default on web
      xhr: true,
      console: true,
      sentry: true,
      dom: true,
      fetch: true,
      history: true,
    });
  });

  it('respects custom options React Native options', () => {
    jest.spyOn(environment, 'isWeb').mockReturnValue(false);

    breadcrumbsIntegration({
      xhr: false,
      console: false,
      sentry: false,
      dom: {}, // Integration should not let user enable DOM breadcrumbs on React Native
      fetch: true, // If user enables it, we should log fetch requests
      history: true, // Integration should not let user enable history breadcrumbs on React Native
    });

    expect(browserBreadcrumbsIntegration).toHaveBeenCalledWith({
      xhr: false,
      console: false,
      sentry: false,
      dom: false,
      fetch: true,
      history: false,
    });
  });

  it('respects custom options when isWeb returns true', () => {
    jest.spyOn(environment, 'isWeb').mockReturnValue(true);

    breadcrumbsIntegration({
      // Everything can be disabled on web
      xhr: false,
      console: false,
      sentry: false,
      dom: false,
      fetch: false,
      history: false,
    });

    expect(browserBreadcrumbsIntegration).toHaveBeenCalledWith({
      xhr: false,
      console: false,
      sentry: false,
      dom: false,
      fetch: false,
      history: false,
    });
  });
});
