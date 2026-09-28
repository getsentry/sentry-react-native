import { getTraceData } from '@sentry/core';
import * as Sentry from '@sentry/react-native';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

// The trace context is only injected into pages served from an allow-listed host.
// `source.html` is loaded under `baseUrl`, so the page's `location.hostname`
// matches this entry and the injection runs.
const ALLOWED_HOST = 'sentry-webview-demo.local';
const BASE_URL = `https://${ALLOWED_HOST}/`;

// A minimal page that reads the injected `sentry-trace` meta tag and posts it
// back to React Native so we can eyeball that it matches the app's trace. A real
// app would instead run `@sentry/browser` here, which continues the trace on its own.
const DEMO_PAGE = `<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body style="font-family: -apple-system, system-ui, sans-serif; padding: 20px;">
    <h3>WebView page</h3>
    <p>Injected <code>sentry-trace</code>:</p>
    <pre id="trace" style="white-space: pre-wrap; word-break: break-all;">(reading…)</pre>
    <script>
      var trace = document.querySelector('meta[name="sentry-trace"]');
      var baggage = document.querySelector('meta[name="baggage"]');
      document.getElementById('trace').textContent = trace ? trace.content : '(none — not injected)';
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ sentryTrace: trace && trace.content, baggage: baggage && baggage.content }),
        );
      }
    </script>
  </body>
</html>`;

const WebviewScreen = () => {
  // The trace active in React Native when the WebView mounts — this is what gets injected.
  const rnTrace = getTraceData()['sentry-trace'];
  const [received, setReceived] = React.useState<string | null>(null);

  const matches = received != null && received === rnTrace;

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
        source={{ html: DEMO_PAGE, baseUrl: BASE_URL }}
        onMessage={event => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            setReceived(data.sentryTrace ?? '(none)');
          } catch {
            // ignore non-JSON messages from the page
          }
        }}
        style={styles.webview}
        {...Sentry.sentryWebViewProps({ allowedHosts: [ALLOWED_HOST] })}
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
