import type { SerializedTraceData } from '@sentry/core';

import { debug, getTraceData, objectToBaggageHeader, parseBaggageHeader } from '@sentry/core';

const WEBVIEW_LABEL = 'Sentry WebView';

/**
 * `baggage` key carrying the root span's name. It is free-form text and can
 * contain user data (for example a parameterized URL), so it is removed from the
 * trace context before it leaves the app and reaches the WebView page.
 */
const SENTRY_TRANSACTION_BAGGAGE_KEY = 'sentry-transaction';

export interface SentryWebViewOptions {
  /**
   * Hosts whose pages receive the injected Sentry trace context.
   *
   * Provide bare hostnames. A page is matched when its hostname equals an entry or
   * is a subdomain of it (e.g. `'example.com'` matches both `example.com` and
   * `app.example.com`). Entries are normalized before comparison — surrounding
   * whitespace, a scheme, a path, a port, and a trailing dot are stripped, and
   * matching is case-insensitive. Only listed hosts are instrumented, so the trace
   * context — which can carry release and environment data in `baggage` — never
   * reaches third-party pages loaded in the WebView.
   */
  allowedHosts: string[];
}

/**
 * Props to spread onto a `react-native-webview` `<WebView>` to connect its traces
 * with the React Native app's trace.
 *
 * The returned `injectedJavaScriptBeforeContentLoaded` writes the current trace as
 * `sentry-trace` / `baggage` `<meta>` tags into the WebView document during its
 * initial load, so a `@sentry/browser` running in the page continues the same trace
 * on pageload (its pageload transaction and errors share the trace). The in-WebView
 * page must run `@sentry/browser` for the connection to take effect.
 *
 * Timing note: on iOS the tags are written before any page script runs. On Android
 * `react-native-webview` injects the script asynchronously as the page starts, so
 * the tags can land slightly after the page's first synchronous `<head>` scripts.
 * `@sentry/browser` loaded the usual way — from a `<script>` tag, a bundle, or an
 * `async`/deferred init — reads the tags after they're present and continues the
 * trace; only a `@sentry/browser` initialized synchronously inline at the very top
 * of `<head>` may run before the tags exist on Android and start a new trace. In
 * that case the WebView simply gets its own trace; nothing else is affected.
 *
 * The root span name (`sentry-transaction`) is stripped from `baggage` before it
 * is injected, as it is free-form text that may carry user data.
 *
 * A no-op `onMessage` is also returned: `react-native-webview` only executes
 * injected JavaScript on Android when an `onMessage` handler is set, so this is
 * required for the injection to run there. If you need your own `onMessage`, spread
 * these props first and set `onMessage` after them — any handler keeps the injection
 * running on Android.
 *
 * `injectedJavaScriptBeforeContentLoaded` is a single string, not a list. Spreading
 * these props and then setting your own `injectedJavaScriptBeforeContentLoaded`
 * after replaces Sentry's injection and silently disables trace linking (and setting
 * it before the spread drops yours). If you have your own before-content script,
 * concatenate it with the returned one instead of overriding it.
 *
 * @example
 * ```tsx
 * <WebView
 *   source={{ uri: 'https://example.com' }}
 *   {...sentryWebViewProps({ allowedHosts: ['example.com'] })}
 * />
 * ```
 *
 * @example
 * Composing with your own `injectedJavaScriptBeforeContentLoaded`:
 * ```tsx
 * const { injectedJavaScriptBeforeContentLoaded, onMessage } =
 *   sentryWebViewProps({ allowedHosts: ['example.com'] });
 *
 * <WebView
 *   source={{ uri: 'https://example.com' }}
 *   onMessage={onMessage}
 *   injectedJavaScriptBeforeContentLoaded={myScript + '\n' + injectedJavaScriptBeforeContentLoaded}
 * />
 * ```
 */
export function sentryWebViewProps(options: SentryWebViewOptions): {
  injectedJavaScriptBeforeContentLoaded: string;
  onMessage: () => void;
} {
  return {
    injectedJavaScriptBeforeContentLoaded: createSentryWebViewInjection(options),
    // Required on Android: `react-native-webview` only runs injected JavaScript
    // when an `onMessage` handler is present.
    onMessage: () => {
      // noop
    },
  };
}

/**
 * Builds the script run inside the WebView before content loads. Returns an empty
 * string when there is no active trace to propagate.
 */
function createSentryWebViewInjection({ allowedHosts }: SentryWebViewOptions): string {
  // `allowedHosts` is required, but validate at runtime so a misuse (or an empty
  // list) degrades to a no-op with a warning instead of throwing during render.
  // Entries are normalized to bare lowercase hostnames so they match the page's
  // `location.hostname`.
  const normalizedHosts = (Array.isArray(allowedHosts) ? allowedHosts : [])
    .map(normalizeHost)
    .filter(host => host.length > 0);
  if (normalizedHosts.length === 0) {
    debug.warn(`[${WEBVIEW_LABEL}] No valid allowedHosts provided; skipping WebView trace injection.`);
    return '';
  }

  const traceData: SerializedTraceData = getTraceData();
  const sentryTrace = traceData['sentry-trace'];

  if (!sentryTrace) {
    debug.log(
      `[${WEBVIEW_LABEL}] No trace data available (the SDK is disabled or not initialized); skipping WebView trace injection.`,
    );
    return '';
  }

  // Values are embedded via JSON.stringify so any characters in `baggage` are
  // safely escaped. `allowedHosts` is checked against `location.hostname` inside
  // the page: the script re-runs on every document load, so each navigation is
  // gated on its own host rather than the one the WebView was opened with. The
  // script is idempotent — if a `sentry-trace` meta already exists (e.g. injected
  // by another path), it does nothing, so the trace context is never duplicated.
  const allowedHostsLiteral = JSON.stringify(normalizedHosts);
  const sentryTraceLiteral = JSON.stringify(sentryTrace);
  const baggageLiteral = JSON.stringify(stripTransactionFromBaggage(traceData.baggage) ?? null);

  return `(function(){try{
var allowed=${allowedHostsLiteral};
var host=(window.location&&window.location.hostname||'').toLowerCase();
if(!host)return;
if(!allowed.some(function(h){return host===h||host.slice(-(h.length+1))==='.'+h;}))return;
if(document.querySelector('meta[name="sentry-trace"]'))return;
var head=document.head||document.documentElement;
if(!head)return;
var set=function(n,c){if(!c)return;var m=document.createElement('meta');m.setAttribute('name',n);m.setAttribute('content',c);head.appendChild(m);};
set('sentry-trace',${sentryTraceLiteral});
set('baggage',${baggageLiteral});
}catch(e){}})();
true;`;
}

/**
 * Normalizes an `allowedHosts` entry to a bare lowercase hostname so it can be
 * compared against the page's `location.hostname`. Tolerates entries that
 * accidentally include surrounding whitespace, a scheme, a path, a port, or a
 * trailing dot (e.g. `' https://App.Example.com:8080/x '` → `'app.example.com'`).
 * IPv6 literals are bracketed to match `location.hostname` (`'::1'` → `'[::1]'`,
 * `'[::1]:8080'` → `'[::1]'`).
 */
function normalizeHost(host: string): string {
  const withoutScheme = host.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // leading scheme://
  // Drop everything from the first path/query/fragment separator. Uses
  // `search` + `slice` rather than a `.*`-anchored regex to avoid polynomial
  // backtracking (CodeQL flags `[/?#].*$`).
  const pathStart = withoutScheme.search(/[/?#]/);
  let hostAndPort = pathStart === -1 ? withoutScheme : withoutScheme.slice(0, pathStart);

  // Strip the port without mistaking an IPv6 hextet for one. Browsers bracket IPv6
  // in `location.hostname` (e.g. `[::1]`), so: a bracketed host keeps everything up
  // to the closing bracket (dropping any `:port` after it); an unbracketed IPv6
  // literal (more than one colon) is wrapped in brackets so it still matches; a
  // regular hostname or IPv4 keeps its port-stripping.
  const closingBracket = hostAndPort.indexOf(']');
  if (closingBracket !== -1) {
    hostAndPort = hostAndPort.slice(0, closingBracket + 1);
  } else if ((hostAndPort.match(/:/g) ?? []).length > 1) {
    hostAndPort = `[${hostAndPort}]`;
  } else {
    hostAndPort = hostAndPort.replace(/:\d+$/, '');
  }

  return hostAndPort
    .replace(/\.$/, '') // trailing dot
    .toLowerCase();
}

/**
 * Removes the `sentry-transaction` entry from a `baggage` header before it is
 * injected into the WebView. The root span name is free-form text that may carry
 * user data, while every other Dynamic Sampling Context entry (release,
 * environment, sample rate, etc.) is kept so sampling stays consistent across the
 * connected traces. Any non-Sentry (third-party) baggage entries are preserved.
 *
 * Returns `undefined` when there is no baggage to propagate after trimming.
 */
function stripTransactionFromBaggage(baggage: string | undefined): string | undefined {
  if (!baggage) {
    return undefined;
  }

  // A non-empty header always parses to an object; `?? {}` only satisfies the type.
  const parsed = parseBaggageHeader(baggage) ?? {};

  // Rebuild without the transaction entry rather than deleting it in place.
  const safe: Record<string, string> = {};
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (key !== SENTRY_TRANSACTION_BAGGAGE_KEY && value !== undefined) {
      safe[key] = value;
    }
  }

  // `objectToBaggageHeader` returns `undefined` when nothing is left to propagate.
  return objectToBaggageHeader(safe);
}
