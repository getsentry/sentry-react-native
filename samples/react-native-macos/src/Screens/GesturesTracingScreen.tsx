import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { sentryTraceGesture, startSpanManual } from '@sentry/react-native';
import { Span } from '@sentry/core';

const GesturesTracingScreen = () => {
  const gesture = Gesture.Pinch().onBegin(() => {
    startExampleSpan();
  });

  return (
    <GestureDetector gesture={sentryTraceGesture('pinch', gesture)}>
      <View style={styles.screen}>
        <Text>Do pinch gesture</Text>
      </View>
    </GestureDetector>
  );
};

const startExampleSpan = () => {
  startSpanManual({ name: 'Example', op: 'example' }, (span: Span) => {
    setTimeout(() => {
      span.end();
    }, 1000);
  });
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default GesturesTracingScreen;
