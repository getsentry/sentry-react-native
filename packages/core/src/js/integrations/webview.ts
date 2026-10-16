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
   * A page is matched when its hostname equals an entry or is a subdomain of it
   * (e.g. `'example.com'` matches both `example.com` and `app.example.com`).
   * Matching is case-insensitive. Only
   * listed hosts are instrumented, so the trace context — which can carry release
   * and environment data in `baggage` — never reaches third-party pages loaded in
   * the WebView.
   */
  allowedHosts: string[];
}

/**
 * Props to spread onto a `react-native-webview` `<WebView>` to connect its traces
 * with the React Native app's trace.
 *
 * The returned `injectedJavaScriptBeforeContentLoaded` writes the current trace as
 * `sentry-trace` / `baggage` `<meta>` tags into the WebView document before its
 * `@sentry/browser` initializes, so the page's pageload transaction and errors
 * continue the same trace. The in-WebView page must run `@sentry/browser` for the
 * connection to take effect.
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
  const traceData: SerializedTraceData = getTraceData();
  const sentryTrace = traceData['sentry-trace'];

  if (!sentryTrace) {
    debug.log(`[${WEBVIEW_LABEL}] No active trace found; skipping WebView trace injection.`);
    return '';
  }

  // Values are embedded via JSON.stringify so any characters in `baggage` are
  // safely escaped. `allowedHosts` is checked against `location.hostname` inside
  // the page: the script re-runs on every document load, so each navigation is
  // gated on its own host rather than the one the WebView was opened with. The
  // script is idempotent — if a `sentry-trace` meta already exists (e.g. injected
  // by another path), it does nothing, so the trace context is never duplicated.
  const allowedHostsLiteral = JSON.stringify((allowedHosts ?? []).map(host => host.toLowerCase()));
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
