import * as React from 'react';
import { Modal, SafeAreaView, View, Image, Pressable, Text, StyleSheet, useColorScheme } from 'react-native';
import { getDevServer } from '../integrations/debugsymbolicatorutils';

function openURLInBrowser(url: string) {
  // This doesn't work for Expo project with Web enabled
  fetch(getDevServer().url + 'open-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export const Wizard = () => {
  const [show, setShow] = React.useState(true);
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  return (
    <Modal
      presentationStyle="formSheet"
      visible={show}
      animationType="slide"
      onRequestClose={() => {
        setShow(false);
      }}
    >
      <SafeAreaView style={styles.background}>
        <View style={styles.container}>
          <Text style={styles.welcomeText}>Welcome to Sentry Starter!</Text>
          <Image source={require('../../../images/hi.gif')} style={{ width: 100, height: 100 }} />
          <View style={styles.listContainer}>
            <Row
              title={'captureException()'}
              description={'In try-catch scenario error can be reported using manual APIs.'}
              action={'Try'}
            />
            <Row
              title={'throw new Error()'}
              description={'Uncaught errors are automatically reported from React Native Global Handler.'}
              action={'Throw'}
            />
            <Row
              title={'throw RuntimeException()'}
              description={
                'Unhandled errors in the native layers like Java, Objective-C, C, Swift or Kotlin are automatically reported. '
              }
              action={'Crash'}
              last
            />
          </View>
          <View style={{ marginTop: 40 }} />
          <View
            style={{
              width: '100%',
              flexDirection: 'row', // Arrange buttons horizontally
              justifyContent: 'space-evenly', // Space between buttons
            }}
          >
            <Button
              secondary={}
              title={'Open Sentry'}
              onPress={() => {
                openURLInBrowser('https://sentry.io/');
              }}
            />
            <Button
              title={'Go to my App'}
              onPress={() => {
                setShow(false);
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const Row = ({ last, action, title, description }) => {
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  return (
    <View style={[styles.rowContainer, last && styles.lastRowContainer]}>
      <View style={{ flexShrink: 1, paddingRight: 12 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={{ color: 'rgb(146, 130, 170)', fontSize: 12 }}>{description}</Text>
      </View>
      <View>
        <Button secondary onPress={() => {}} title={action} />
      </View>
    </View>
  );
};

const Button = ({ onPress, title, secondary }) => {
  const styles = useColorScheme() === 'dark' ? defaultDarkStyles : lightStyles;

  return (
    <View style={[styles.buttonBottomLayer, styles.buttonCommon, secondary && styles.buttonSecondaryBottomLayer]}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonMainContainer,
          pressed && styles.buttonMainContainerPressed,
          styles.buttonCommon,
          secondary && styles.buttonSecondaryContainer,
        ]}
        onPress={onPress}
      >
        <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>
      </Pressable>
    </View>
  );
};

const defaultDarkStyles = StyleSheet.create({
  welcomeText: { color: 'rgb(246, 245, 250)', fontSize: 24, fontWeight: 'bold' },
  background: {
    flex: 1,
    backgroundColor: 'rgb(39, 36, 51)',
    width: '100%',
    minHeight: '100%',
    alignItems: 'center', // Center content horizontally
    justifyContent: 'center', // Center content vertically
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    padding: 12,
    marginTop: 20,
    width: '100%',
    alignItems: 'center', // Center image and button container
    justifyContent: 'space-evenly', // Center image and button container
  },
  buttonContainer: {
    flexDirection: 'row', // Arrange buttons horizontally
    marginTop: 20, // Add some space above the buttons
  },
  listContainer: {
    width: '100%',
    flexDirection: 'column',
    marginTop: 20, // Add some space above the buttons
    borderColor: 'rgb(7, 5, 15)',
    borderWidth: 1,
    borderRadius: 8,
  },
  rowTitle: {
    color: 'rgb(246, 245, 250)',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'left',
    fontFamily: 'Menlo',
  },
  rowContainer: {
    overflow: 'hidden',
    flexDirection: 'row',
    justifyContent: 'space-between', // Space between buttons
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderColor: 'rgb(7, 5, 15)',
    borderBottomWidth: 1,
  },
  lastRowContainer: {
    borderBottomWidth: 0, // Remove border for the last row
  },
  buttonCommon: {
    borderRadius: 8,
  },
  buttonBottomLayer: {
    backgroundColor: 'rgb(7, 5, 15)',
  },
  buttonMainContainer: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: 'rgb(117, 83, 255)',
    transform: [{ translateY: -4 }],
    borderWidth: 1,
    borderColor: 'rgb(7, 5, 15)',
  },
  buttonSecondaryContainer: {
    backgroundColor: 'rgb(39, 36, 51)',
  },
  buttonSecondaryBottomLayer: {},
  buttonSecondaryText: {},
  buttonMainContainerPressed: {
    transform: [{ translateY: 0 }],
  },
  buttonText: {
    color: 'rgb(246, 245, 250)',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

const lightStyles: typeof defaultDarkStyles = StyleSheet.create({
  ...defaultDarkStyles,
  welcomeText: {
    ...defaultDarkStyles.welcomeText,
    color: 'rgb(24, 20, 35)',
  },
  background: {
    ...defaultDarkStyles.background,
    backgroundColor: 'rgb(251, 250, 255)',
  },
  buttonMainContainer: {
    ...defaultDarkStyles.buttonMainContainer,
    backgroundColor: 'rgb(117, 83, 255)',
    borderColor: 'rgb(85, 61, 184)',
  },
  buttonBottomLayer: {
    backgroundColor: 'rgb(85, 61, 184)',
  },
  buttonSecondaryContainer: {
    backgroundColor: 'rgb(255, 255, 255)',
    borderColor: 'rgb(218, 215, 229)',
  },
  buttonSecondaryBottomLayer: {
    backgroundColor: 'rgb(218, 215, 229)',
  },
  buttonText: {
    ...defaultDarkStyles.buttonText,
  },
  buttonSecondaryText: {
    ...defaultDarkStyles.buttonText,
    color: 'rgb(24, 20, 35)',
  },
  rowTitle: {
    ...defaultDarkStyles.rowTitle,
    color: 'rgb(24, 20, 35)',
  },
  rowContainer: {
    ...defaultDarkStyles.rowContainer,
    borderColor: 'rgb(218, 215, 229)',
  },
  listContainer: {
    ...defaultDarkStyles.listContainer,
    borderColor: 'rgb(218, 215, 229)',
    backgroundColor: 'rgb(255, 255, 255)',
  },
});
