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
import SvgGraphic from '../components/SvgGraphic';

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
              <Text>Pressable:</Text>
              <Pressable
                onPress={event => {
                  event.stopPropagation();
                  event.preventDefault();
                  console.log('Pressable pressed');
                }}>
                <Text>Press me</Text>
              </Pressable>
              <Text>react-native-svg</Text>
              <SvgGraphic />
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
