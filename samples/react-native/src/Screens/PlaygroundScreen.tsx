import * as React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  Image,
  ImageBackground,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
  SafeAreaView,
  Pressable,
} from 'react-native';

const multilineText = `This
is
a
multiline
input
text
`;

const PlaygroundScreen = () => {
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={'padding'} style={styles.container}>
        <ScrollView>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
              <Text>Text:</Text>
              <Text>{'This is <Text>'}</Text>
              <View style={styles.space} />
              <Text>TextInput:</Text>
              <TextInput
                editable
                multiline
                numberOfLines={5}
                defaultValue={multilineText}
                style={styles.textInputStyle}
              />
              <View style={styles.space} />
              <Text>Image:</Text>
              <Image
                source={require('../assets/sentry-announcement.png')}
                style={styles.image}
              />
              <View style={styles.space} />
              <Text>BackgroundImage:</Text>
              <View style={styles.container}>
                <ImageBackground
                  source={require('../assets/sentry-announcement.png')}
                  resizeMode="cover"
                  style={styles.image}>
                  <Text>This text should be over the image.</Text>
                </ImageBackground>
              </View>
              <View style={styles.space} />
              <Text>Network image:</Text>
              <Image
                style={{ width: 400, height: 119 }}
                source={{ uri: 'https://reactjs.org/logo-og.png' }}
              />
              <View style={styles.space} />
              <Text>URI data image:</Text>
              <Image
                style={{ width: 100, height: 30 }}
                source={{
                  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAeCAYAAADaW7vzAAAAAXNSR0IArs4c6QAAAzJJREFUaEPtWUFy2zAMFJ3vNL0101udXzT9TOLPNP1F3FsnvTX9TswWjFYDwwAFUpoMPWauFkkQi90FmDD0v6YyEJqKpgczdEAaK4IOSAeksQw0Fs4ihny6vnui+4QQfj7/+f7Q2N3OMpxqQAiMMAxb3HoT4+2vvz/2Z5mFhoKuAuTm47eHIcb7/9TYbQ6H/SGEpzgM+98vj7cN3e0sQ6kD5Pou0m2fXx7T+oktIey6dC2rg2JAODt48m8ESKVh0b4xxi8kg8Q26Uv4PbcvMfTzh6/b1xDuc76WCmj0Pfhgbt+rGHeHzWZL8cnvaJ9UnKOHIk5aY0k4ztQUpRwQI/EWUB5gwDAAAWBoLbwJ+9M31p4AhCSUr5XfU/FAYiUgKAi+BoCQTMvzNR/NFedcnooAoerDZTXPQGJLDD4XIJ2HKsN3c3vzGC1QOCA88dNaRXpz5/Ni4UUhczQHRupYPRV8UmEwdVbB9A0uVGLw3kR7v+NJRUVLaVgbELq7ZIVWnB5ZdwOSNmOVM6EtQCllCQcxp/ulgBCTSPfRDUq/04qmliEA5IQRTBo97HAzhCdfA4UHsoQlExND2HGjTBceWWl5CEwU50PatA5wTYak8wzgj4qNZjZHF+piCKhGG0oZ0JD3VoMmhdzQKflIdC0gvC2fGgRWuaUeYpq6kWw+QGNMyNnELCAyuVqyNZkqlS7Lp8C+GslCQyBZu4Qh6AQp3ql4MpWfk0ENmCwgRx0LO1QmW5OpGumSAfJ+fQkgUvLQ2kqzL/UQzx1XBQQXkZWgBQKQOC09LMkNUryRWAoIByVVt/LUUwrI0Z4GS1YDhM8Aqg6PJgtdlmbqbYN5w7DmYGjNK3wIXcoQMDpXeKsBIntmjRVSizVt9r5zJWDehHmahvnzA55EcobIn06sp4vc04rnN2tf6znE85TD76R6iNUlyUqQMqXJljY01Qyjl7JGB8R4r5KyJHXdBETI26Ukt+aeKiBcZ+Wm6TFtNDBtNqDfYez8hZavqwn0UtaogEy6x/4jeJSQERD5kIdvTqZk+sExpV5K0hcNhj1J75uB2Un9fcPpp3VAGquBDkgHpLEMNBbOPxaNh1tngBQSAAAAAElFTkSuQmCC',
                }}
              />
              <Text>Pressable:</Text>
              <Pressable
                onPress={event => {
                  event.stopPropagation();
                  event.preventDefault();
                  console.log('Pressable pressed');
                }}>
                <Text>Press me</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PlaygroundScreen;

const styles = StyleSheet.create({
  space: {
    marginBottom: 50,
  },
  container: {
    padding: 5,
    flex: 1,
  },
  image: {
    width: 200,
    height: 200,
  },
  backgroundImageContainer: {
    width: 200,
    height: 200,
  },
  textInputStyle: {
    height: 200,
    borderColor: 'gray',
    borderWidth: 1,
  },
});
