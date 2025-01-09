import React from 'react';
import { Text, View } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';

export function RedirectToRedirectedScreen(props: {
  navigation: StackNavigationProp<any, 'RedirectToRedirectedScreen'>;
}) {
  useFocusEffect(() => {
    // The created transaction will be named `RedirectToRedirectedScreen` (based on the initial navigation action)
    props.navigation.replace('RedirectedScreen');
  });

  return null;
}

export function RedirectedScreen() {
  useFocusEffect(() => {
    Sentry.startInactiveSpan({ name: 'Redirected Screen Focused' }).end();
  });
  return <View><Text>RedirectedScreen</Text></View>;
}
