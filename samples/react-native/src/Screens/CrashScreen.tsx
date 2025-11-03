import React from 'react';
import { View, Button } from 'react-native';

// Object with notAFunction property to demonstrate the crash
const testObject = {
  notAFunction: "I'm not a function!",
};


function CrashScreen() {
  // This will crash on screen load
  testObject.notAFunction()

  // The button never actually loads. Left here for testing purposes.
  return (
    <View>
      <Button
        title='Crash Now!'
        onPress={() => testObject.notAFunction()}
      />
    </View>
  );
}

export default CrashScreen;
