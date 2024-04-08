import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Scope, sentryTraceGesture, startSpan, startSpanManual } from '@sentry/react-native';
import { Span } from '@sentry/types';

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
    span.end();
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
