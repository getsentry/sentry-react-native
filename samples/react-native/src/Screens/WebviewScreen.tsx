import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-gesture-handler';
// import { WebView } from 'react-native-webview';

const WebviewScreen = () => {
  return (
    // <WebView
    //   source={{ uri: 'https://sentry.io' }}
    //   style={styles.webview}
    // />
    <View style={styles.webview}>
      <Text>
        WebView is disabled due to incompatibilities with the React Native
        version 0.79.2
      </Text>
    </View>
  );
};

export default WebviewScreen;

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
