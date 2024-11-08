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
  Button,
} from 'react-native';
import SvgGraphic from '../components/SvgGraphic';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Sentry from '@sentry/react-native';

const multilineText = `This
is
a
multiline
input
text
`;

interface Props {
  navigation: StackNavigationProp<any, 'PlaygroundScreen'>;
}

const PlaygroundScreen = (props: Props) => {
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={'padding'} style={styles.container}>
        <ScrollView>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
              <Button
                title="Webview Example"
                onPress={() => {
                  props.navigation.navigate('Webview');
                }}
              />
              <Text>Custom Mask:</Text>
              <View>
                <Sentry.Unmask>
                  <Text>This is masked if all text is masked</Text>
                  <Sentry.Mask>
                    <Text>This is masked always because it's a child of a masked view</Text>
                    <Sentry.Unmask>
                      <Text>This is masked because all children of masked view are masked</Text>
                    </Sentry.Unmask>
                  </Sentry.Mask>
                </Sentry.Unmask>
              </View>
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
    paddingBottom: 50,
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
