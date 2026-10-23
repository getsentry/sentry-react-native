import { getClient, getTraceData } from '@sentry/core';

import { sentryWebViewProps, WEBVIEW_INTEGRATION_NAME } from '../../src/js/tracing/webview';

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    getTraceData: jest.fn(),
    getClient: jest.fn(),
  };
});

const mockGetTraceData = getTraceData as jest.Mock;
const mockGetClient = getClient as jest.Mock;

const SENTRY_TRACE = 'd4cda95b652f4a1592b449d5929fda1b-6e0c63257de34c92-1';
const BAGGAGE = 'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-environment=prod';

/**
 * Runs the generated injection script against a minimal DOM and returns the meta
 * tags present afterwards. `existing` pre-seeds meta tags already in the document.
 */
function runInjection(
  script: string,
  hostname: string,
  existing: Array<{ name: string; content: string }> = [],
): Array<{ name: string; content: string }> {
  const metas: Array<{ name: string; content: string }> = [...existing];
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
    querySelector: (selector: string) => {
      const match = /meta\[name="([^"]+)"\]/.exec(selector);
      if (!match) {
        return null;
      }
      const found = metas.find(m => m.name === match[1]);
      return found ? { ...found } : null;
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

    it.each([
      ['surrounding whitespace', '  example.com  '],
      ['a scheme', 'https://example.com'],
      ['a port', 'example.com:8080'],
      ['a path', 'example.com/some/path'],
      ['a trailing dot', 'example.com.'],
      ['scheme, port, and path', 'https://Example.com:443/x?y#z'],
    ])('normalizes an allowedHosts entry with %s', (_name, entry) => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: [entry] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'example.com');

      // Assert
      expect(metas).toHaveLength(2);
    });

    // `location.hostname` brackets IPv6 (e.g. `[::1]`), and a hextet must not be
    // mistaken for a `:port`.
    it.each([
      ['an unbracketed IPv6 literal', '::1', '[::1]'],
      ['a bracketed IPv6 literal', '[::1]', '[::1]'],
      ['a bracketed IPv6 literal with a port', '[::1]:8080', '[::1]'],
      ['a full unbracketed IPv6 literal', '2001:db8::1', '[2001:db8::1]'],
      ['a bracketed IPv6 literal case-insensitively', '[2001:DB8::1]', '[2001:db8::1]'],
    ])('injects on an IPv6 host for %s', (_name, entry, hostname) => {
      // Arrange
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: [entry] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, hostname);

      // Assert
      expect(metas).toHaveLength(2);
    });
  });

  describe('when allowedHosts is empty or invalid', () => {
    beforeEach(() => {
      mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE, baggage: BAGGAGE });
    });

    it.each([
      ['an empty array', []],
      ['only blank entries', ['   ', '']],
      ['missing (undefined)', undefined],
    ])('returns an empty injection script for %s', (_name, allowedHosts) => {
      // Act
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({
        allowedHosts: allowedHosts as string[],
      });

      // Assert
      expect(injectedJavaScriptBeforeContentLoaded).toBe('');
    });
  });

  describe('when the page already has a sentry-trace meta', () => {
    it('does not inject again (idempotent)', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE, baggage: BAGGAGE });
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'example.com', [
        { name: 'sentry-trace', content: 'already-there' },
      ]);

      // Assert
      expect(metas).toEqual([{ name: 'sentry-trace', content: 'already-there' }]);
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

  describe('when baggage carries a transaction entry', () => {
    it('strips sentry-transaction but keeps every other entry', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({
        'sentry-trace': SENTRY_TRACE,
        baggage:
          'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-environment=prod,' +
          'sentry-transaction=GET%20%2Fusers%2F123,sentry-sample_rate=1.0,othervendor=keepme',
      });
      const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Act
      const metas = runInjection(injectedJavaScriptBeforeContentLoaded, 'example.com');

      // Assert
      const baggageMeta = metas.find(m => m.name === 'baggage');
      expect(baggageMeta?.content).toBe(
        'sentry-trace_id=d4cda95b652f4a1592b449d5929fda1b,sentry-environment=prod,sentry-sample_rate=1.0,othervendor=keepme',
      );
      expect(baggageMeta?.content).not.toContain('sentry-transaction');
    });

    it('drops the baggage meta entirely when transaction is the only entry', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({
        'sentry-trace': SENTRY_TRACE,
        baggage: 'sentry-transaction=GET%20%2Fusers%2F123',
      });
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

  describe('returned props', () => {
    it('include a no-op onMessage (required for injected JS to run on Android)', () => {
      // Arrange
      mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE });

      // Act
      const props = sentryWebViewProps({ allowedHosts: ['example.com'] });

      // Assert
      expect(typeof props.onMessage).toBe('function');
      expect(props.onMessage()).toBeUndefined();
    });
  });

  // The injected script embeds trace values via JSON.stringify. These tests feed
  // hostile values through every embedding point and assert they can only ever be
  // read back as inert meta content — never executed as code. A breakout would set
  // the `__pwned` canary on the fuzzed window.
  describe('fuzzing: embedded values cannot break out of the injected script', () => {
    /** Runs the script against a fresh DOM and reports whether a breakout executed. */
    function runFuzz(
      script: string,
      hostname: string,
    ): { metas: Array<{ name: string; content: string }>; pwned: boolean } {
      const metas: Array<{ name: string; content: string }> = [];
      const head = {
        appendChild: (el: { name: string; content: string }) => metas.push({ name: el.name, content: el.content }),
      };
      const fakeDocument = {
        head,
        documentElement: head,
        createElement: () => ({
          name: '',
          content: '',
          setAttribute(k: string, v: string) {
            (this as unknown as Record<string, string>)[k] = v;
          },
        }),
        querySelector: () => null,
      };
      const fakeWindow: { location: { hostname: string }; __pwned?: boolean } = { location: { hostname } };

      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function('window', 'document', script)(fakeWindow, fakeDocument);
      return { metas, pwned: fakeWindow.__pwned === true };
    }

    // Each payload attempts a different escape from the JSON string literal it is
    // embedded in, then tries to execute `window.__pwned=1`.
    const BREAKOUT_PAYLOADS: Array<[name: string, payload: string]> = [
      ['double-quote close', '");window.__pwned=1;("'],
      ['single-quote close', "');window.__pwned=1;('"],
      ['backtick / template', '`;window.__pwned=1;`'],
      ['template substitution', '${window.__pwned=1}'],
      ['script tag', '</script><script>window.__pwned=1;</script>'],
      ['escaped backslash then quote', '\\";window.__pwned=1;//'],
      ['statement + comment', '"}]);window.__pwned=1;//'],
      ['newline injection', '\nwindow.__pwned=1;\n'],
      ['carriage return injection', '\rwindow.__pwned=1;\r'],
      ['U+2028 line separator', '\u2028window.__pwned=1;'],
      ['U+2029 paragraph separator', '\u2029window.__pwned=1;'],
      ['null byte', 'abc\u0000;window.__pwned=1;'],
    ];

    describe('via the sentry-trace value', () => {
      it.each(BREAKOUT_PAYLOADS)('neutralizes %s', (_name, payload) => {
        // Arrange
        mockGetTraceData.mockReturnValue({ 'sentry-trace': payload });
        const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

        // Act
        const { metas, pwned } = runFuzz(injectedJavaScriptBeforeContentLoaded, 'example.com');

        // Assert — the payload is preserved verbatim as inert content, never run.
        expect(pwned).toBe(false);
        expect(metas).toEqual([{ name: 'sentry-trace', content: payload }]);
      });
    });

    describe('via a baggage entry value', () => {
      it.each(BREAKOUT_PAYLOADS)('neutralizes %s', (_name, payload) => {
        // Arrange — carry the payload as a URL-encoded baggage entry value.
        mockGetTraceData.mockReturnValue({
          'sentry-trace': SENTRY_TRACE,
          baggage: `sentry-release=${encodeURIComponent(payload)}`,
        });
        const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

        // Act
        const { pwned } = runFuzz(injectedJavaScriptBeforeContentLoaded, 'example.com');

        // Assert
        expect(pwned).toBe(false);
      });
    });

    describe('via an allowedHosts entry', () => {
      it.each(BREAKOUT_PAYLOADS)('neutralizes %s', (_name, payload) => {
        // Arrange — a hostile host alongside the real one the page is served from.
        mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE });
        const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({
          allowedHosts: [payload, 'example.com'],
        });

        // Act
        const { pwned } = runFuzz(injectedJavaScriptBeforeContentLoaded, 'example.com');

        // Assert
        expect(pwned).toBe(false);
      });
    });

    it('preserves arbitrary random sentry-trace values as inert content', () => {
      // Arrange — property-style fuzzing over a dangerous character set.
      const CHARS = '"\'`\\${}();/<>\n\r\t\u2028\u2029abc0= ,';
      // Seeded PRNG (Park–Miller MINSTD) keeps the run deterministic, so a failing
      // case is reproducible instead of depending on `Math.random()`. Uses only
      // arithmetic (stays within safe-integer range) to satisfy the no-bitwise rule.
      let seed = 123456789;
      const rand = (): number => {
        seed = (seed * 48271) % 2147483647;
        return seed / 2147483647;
      };
      for (let i = 0; i < 200; i++) {
        const length = 1 + Math.floor(rand() * 40);
        let payload = '';
        for (let c = 0; c < length; c++) {
          payload += CHARS[Math.floor(rand() * CHARS.length)];
        }
        mockGetTraceData.mockReturnValue({ 'sentry-trace': payload });
        const { injectedJavaScriptBeforeContentLoaded } = sentryWebViewProps({ allowedHosts: ['example.com'] });

        // Act
        const { metas, pwned } = runFuzz(injectedJavaScriptBeforeContentLoaded, 'example.com');

        // Assert — never executes, always round-trips as content.
        expect(pwned).toBe(false);
        expect(metas).toEqual([{ name: 'sentry-trace', content: payload }]);
        mockGetTraceData.mockReset();
      }
    });
  });
});

describe('sentryWebViewProps feature adoption marker', () => {
  afterEach(() => {
    mockGetClient.mockReset();
    mockGetTraceData.mockReset();
  });

  it('registers the WebView feature marker on the client when used', () => {
    const integrations: Record<string, { name: string }> = {};
    mockGetClient.mockReturnValue({
      getIntegrationByName: (name: string) => integrations[name],
      addIntegration: (integration: { name: string }) => {
        integrations[integration.name] = integration;
      },
    });
    mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE, baggage: BAGGAGE });

    sentryWebViewProps({ allowedHosts: ['example.com'] });

    // The marker flows into `event.sdk.integrations`, the feature-adoption channel.
    expect(integrations[WEBVIEW_INTEGRATION_NAME]).toEqual({ name: WEBVIEW_INTEGRATION_NAME });
  });

  it('registers the marker on use even when there is no active trace to inject', () => {
    const addIntegration = jest.fn();
    mockGetClient.mockReturnValue({ getIntegrationByName: () => undefined, addIntegration });
    // No trace -> the injection is a no-op, but adoption is still recorded.
    mockGetTraceData.mockReturnValue({});

    sentryWebViewProps({ allowedHosts: ['example.com'] });

    expect(addIntegration).toHaveBeenCalledWith({ name: WEBVIEW_INTEGRATION_NAME });
  });

  it('does not register twice (idempotent)', () => {
    const addIntegration = jest.fn();
    let registered = false;
    mockGetClient.mockReturnValue({
      getIntegrationByName: () => (registered ? { name: WEBVIEW_INTEGRATION_NAME } : undefined),
      addIntegration: (integration: { name: string }) => {
        registered = true;
        addIntegration(integration);
      },
    });
    mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE });

    sentryWebViewProps({ allowedHosts: ['example.com'] });
    sentryWebViewProps({ allowedHosts: ['example.com'] });

    expect(addIntegration).toHaveBeenCalledTimes(1);
  });

  it('does not throw when no client is available', () => {
    mockGetClient.mockReturnValue(undefined);
    mockGetTraceData.mockReturnValue({ 'sentry-trace': SENTRY_TRACE });

    expect(() => sentryWebViewProps({ allowedHosts: ['example.com'] })).not.toThrow();
  });
});
