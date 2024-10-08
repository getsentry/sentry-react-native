import * as React from 'react';
import { View, StyleSheet } from 'react-native';

import Counter from '../components/Counter';

const ReduxScreen = () => {
  return (
    <View style={styles.container}>
      <Counter />
    </View>
  );
};

export default ReduxScreen;

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
});
