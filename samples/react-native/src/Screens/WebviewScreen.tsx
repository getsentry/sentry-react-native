import { getTraceData, SDK_VERSION } from '@sentry/core';
import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { getCurrentDsn, SENTRY_INTERNAL_DSN } from '../dsn';

// The trace context is only injected into pages served from an allow-listed host.
// `source.html` is loaded under `baseUrl`, so the page's `location.hostname`
// matches this entry and the injection runs.
const ALLOWED_HOST = 'sentry-webview-demo.local';
const BASE_URL = `https://${ALLOWED_HOST}/`;

// The in-WebView page runs `@sentry/browser`, so its pageload transaction and
// errors continue the trace injected by `sentryWebViewProps` — this is what a real
// app does. `@sentry/browser` is loaded from the CDN pinned to `SDK_VERSION` (the
// `@sentry/core` version this SDK bundles), so the page and the app always share the
// same JS SDK version. The page also reads the injected `sentry-trace` meta tag and
// posts it back to React Native, so the connection stays observable on-device even
// offline, when the CDN script can't load.
function buildDemoPage(dsn: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script src="https://browser.sentry-cdn.com/${SDK_VERSION}/bundle.tracing.min.js" crossorigin="anonymous"></script>
    <script>
      // browserTracingIntegration reads the injected sentry-trace/baggage meta tags
      // on pageload and continues the trace. Guarded so a failed CDN load (offline)
      // doesn't break the page's own trace readback below.
      if (window.Sentry) {
        Sentry.init({
          dsn: ${JSON.stringify(dsn)},
          integrations: [Sentry.browserTracingIntegration()],
          tracesSampleRate: 1.0,
          release: 'webview-demo',
          environment: 'dev',
        });
      }
    </script>
  </head>
  <body style="font-family: -apple-system, system-ui, sans-serif; padding: 20px;">
    <h3>WebView page</h3>
    <p>Injected <code>sentry-trace</code>:</p>
    <pre id="trace" style="white-space: pre-wrap; word-break: break-all;">(reading…)</pre>
    <script>
      // On Android the injected script runs slightly after this page's initial
      // script, so poll briefly for the meta tag. A real app's @sentry/browser reads
      // it during pageload init (which happens later), so it doesn't need this.
      var tries = 0;
      function report() {
        var trace = document.querySelector('meta[name="sentry-trace"]');
        var baggage = document.querySelector('meta[name="baggage"]');
        if (!trace) return false;
        document.getElementById('trace').textContent = trace.content;
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ sentryTrace: trace.content, baggage: baggage && baggage.content }),
          );
        }
        return true;
      }
      if (!report()) {
        var iv = setInterval(function () {
          tries++;
          if (report() || tries > 30) {
            clearInterval(iv);
            if (tries > 30) document.getElementById('trace').textContent = '(none — not injected)';
          }
        }, 100);
      }
    </script>
  </body>
</html>`;
}

const WebviewScreen = () => {
  // The trace active in React Native when the WebView mounts — this is what gets injected.
  const rnTrace = getTraceData()['sentry-trace'];
  const [received, setReceived] = React.useState<string | null>(null);

  const matches = received != null && received === rnTrace;

  // The WebView page's `@sentry/browser` reports to the same DSN as the app, so the
  // connected pageload shows up in the same project. Built once per mount.
  const demoPage = React.useMemo(() => buildDemoPage(getCurrentDsn() ?? SENTRY_INTERNAL_DSN), []);

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.label}>React Native trace</Text>
        <Text style={styles.value} selectable>
          {rnTrace ?? '(no active trace)'}
        </Text>
        <Text style={styles.label}>WebView received</Text>
        <Text style={styles.value} selectable>
          {received ?? '(waiting…)'}
        </Text>
        <Text
          testID="webview-trace-status"
          style={[styles.status, matches ? styles.match : styles.pending]}>
          {matches ? 'WebView trace connected ✓' : 'WebView trace not connected'}
        </Text>
      </View>
      <WebView
        {...Sentry.sentryWebViewProps({ allowedHosts: [ALLOWED_HOST] })}
        source={{ html: demoPage, baseUrl: BASE_URL }}
        onMessage={event => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            setReceived(data.sentryTrace ?? '(none)');
          } catch {
            // ignore non-JSON messages from the page
          }
        }}
        style={styles.webview}
      />
    </View>
  );
};

export default WebviewScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  panel: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 8,
  },
  value: {
    fontSize: 13,
    fontFamily: 'Courier',
    color: '#1e1b2e',
  },
  status: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  match: {
    color: '#2e7d32',
  },
  pending: {
    color: '#b26a00',
  },
  webview: {
    flex: 1,
  },
});
