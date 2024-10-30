import * as React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const WebviewScreen = () => {
  return (
    <WebView
      source={{ uri: 'https://sentry.io' }}
      style={styles.webview}
    />
  );
};

export default WebviewScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});
