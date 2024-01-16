import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * A screen to test performance timing.
 * The `performance.now()` api has been found to return values with varying offsets.
 * As Sentry uses it for event and transaction timing, this screen is just to test the possible offsets and issues
 * that occur with it.
 */
const PerformanceTimingScreen = () => {
  const initialDate = React.useRef(0);
  const initialPerformance = React.useRef(0);

  const [performanceTime, setPerformanceTime] = React.useState(0);
  const [dateTime, setDateTime] = React.useState(0);

  React.useEffect(() => {
    // @ts-expect-error
    if (typeof global.performance !== 'undefined') {
      initialDate.current = Date.now();
      // @ts-expect-error
      initialPerformance.current = global.performance.now();

      const interval = setInterval(() => {
        // @ts-expect-error
        setPerformanceTime(global.performance.now());
        setDateTime(Date.now());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, []);

  const performanceElapsed = Math.floor(
    performanceTime - initialPerformance.current,
  );
  const dateElapsed = Math.floor(dateTime - initialDate.current);

  return (
    <View style={styles.container}>
      <Text>Performance Time: {performanceTime}</Text>
      <Text>Performance Elapsed: {performanceElapsed}ms</Text>
      <Text>Date Time: {dateTime}</Text>
      <Text>Date Elapsed: {dateElapsed}ms</Text>
      <Text>Difference: {performanceElapsed - dateElapsed}ms</Text>
    </View>
  );
};

export default PerformanceTimingScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
