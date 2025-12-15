import React from 'react';
import { StyleSheet } from 'react-native';

import { TypedNavigator } from '@react-navigation/core';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider } from 'react-redux';

import ErrorsScreen from '../Screens/ErrorsScreen';
import store from '../store';

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});

export default function getErrorsTab(Navigator: TypedNavigator<any, any>) {
  return Sentry.withProfiler(
    () => {
      return (
        <GestureHandlerRootView style={styles.wrapper}>
          <Provider store={store}>
            <Navigator.Navigator>
              <Navigator.Screen
                name="ErrorsScreen"
                component={ErrorsScreen}
                options={{ title: 'Errors' }}
              />
              <Navigator.Screen
                name="FeedbackWidget"
                options={{ presentation: 'modal', headerShown: false }}>
                {props => (
                  <Sentry.FeedbackWidget
                    {...props}
                    enableScreenshot={true}
                    onFormClose={props.navigation.goBack}
                    onFormSubmitted={props.navigation.goBack}
                    styles={{
                      submitButton: {
                        backgroundColor: '#6a1b9a',
                        paddingVertical: 15,
                        borderRadius: 5,
                        alignItems: 'center',
                        marginBottom: 10,
                      },
                    }}
                    namePlaceholder={'Fullname'}
                  />
                )}
              </Navigator.Screen>
            </Navigator.Navigator>
          </Provider>
        </GestureHandlerRootView>
      );
    },
    { name: 'ErrorsTab' },
  );
}
