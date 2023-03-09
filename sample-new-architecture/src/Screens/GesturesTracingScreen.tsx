import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { getCurrentHub, Scope, traceGesture } from '@sentry/react-native';
import { PinchGesture } from 'react-native-gesture-handler/lib/typescript/handlers/gestures/pinchGesture';

const GesturesTracingScreen = () => {
  const gesture = Gesture.Pinch()
    .onBegin(() => {
      console.log('Pinch gesture begin');
    })
    .onEnd(() => {
      console.log('Pinch gesture end');
      startExampleSpan();
    });

  return (
    <GestureDetector gesture={traceGesture('pinch', gesture)}>
      <View style={styles.screen}>
        <Text>Do pinch gesture</Text>
      </View>
    </GestureDetector>
  );
};

const startExampleSpan = () => {
  getCurrentHub().withScope((scope: Scope) => {
    const child = scope.getTransaction()?.startChild({ op: 'example' });
    setTimeout(() => {
      child?.finish();
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
