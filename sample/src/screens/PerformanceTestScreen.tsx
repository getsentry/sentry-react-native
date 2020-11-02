import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

/**
 * A screen to test performance timing.
 */
const PerformanceTestScreen = () => {
  const initialDate = React.useRef(0);
  const initialPerformance = React.useRef(0);

  const [performanceTime, setPerformanceTime] = React.useState(0);
  const [dateTime, setDateTime] = React.useState(0);

  React.useEffect(() => {
    // @ts-ignore
    if (typeof global.performance !== 'undefined') {
      initialDate.current = Date.now();
      // @ts-ignore
      initialPerformance.current = global.performance.now();

      const interval = setInterval(() => {
        // @ts-ignore
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

export default PerformanceTestScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
