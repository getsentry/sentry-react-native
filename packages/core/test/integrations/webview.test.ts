import { getTraceData } from '@sentry/core';

import { sentryWebViewProps } from '../../src/js/integrations/webview';

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    getTraceData: jest.fn(),
  };
});

const mockGetTraceData = getTraceData as jest.Mock;

const SENTRY_TRACE = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
const BAGGAGE = 'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-environment=prod';

/** Runs the generated injection script against a minimal DOM and returns the created meta tags. */
function runInjection(script: string, hostname: string): Array<{ name: string; content: string }> {
  const metas: Array<{ name: string; content: string }> = [];
  const head = {
    appendChild: (el: { name: string; content: string }) => metas.push({ name: el.name, content: el.content }),
  };
  const fakeDocument = {
    head,
    documentElement: head,
    createElement: () => {
      const el: { name: string; content: string; setAttribute: (k: string, v: string) => void } = {
        name: '',
        content: '',
        setAttribute(k: string, v: string) {
          (this as unknown as Record<string, string>)[k] = v;
        },
      };
      return el;
    },
  };
  const fakeWindow = { location: { hostname } };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('window', 'document', script)(fakeWindow, fakeDocument);
  return metas;
}

describe('sentryWebViewProps', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when there is an active trace', () => {
    beforeEach(() => {
      mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE, baggage: BAGGAGE });
    });

    it('injects sentry-trace and baggage meta tags on an allow-listed host', () => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'example.com');

      // Assert
      expect(metas).toEqual([
        { name: 'sentry-trace', content: SENTRY_TRACE },
        { name: 'baggage', content: BAGGAGE },
      ]);
    });

    it('injects on a subdomain of an allow-listed host', () => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'app.example.com');

      // Assert
      expect(metas).toHaveLength(2);
    });

    it('matches allow-listed hosts case-insensitively', () => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['Example.COM'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'app.example.com');

      // Assert
      expect(metas).toHaveLength(2);
    });

    it('does not inject on a host that is not allow-listed', () => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'evil.com');

      // Assert
      expect(metas).toHaveLength(0);
    });

    it('does not inject on a host that merely ends with an allow-listed host', () => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'notexample.com');

      // Assert
      expect(metas).toHaveLength(0);
    });
  });

  describe('when baggage is absent', () => {
    it('injects only the sentry-trace meta tag', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE });
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'example.com');

      // Assert
      expect(metas).toEqual([{ name: 'sentry-trace', content: SENTRY_TRACE }]);
    });
  });

  describe('when there is no active trace', () => {
    it('returns an empty injection script', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({});

      // Act
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Assert
      expect(injectedJavaScriptBeforeContentLoaded).toBe('');
    });
  });
});
