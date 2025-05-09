import { on } from 'events';
import * as React from 'react';
import { Modal, SafeAreaView, View, Image, Pressable, Text, StyleSheet } from 'react-native';

export const Wizard = () => {
  const [show, setShow] = React.useState(true);

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
          <Text style={{ color: 'rgb(246, 245, 250)', fontSize: 24, fontWeight: 'bold' }}>
            Welcome to Sentry Starter!
          </Text>
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
          <Button
            title={'Go to my App'}
            onPress={() => {
              setShow(false);
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const Row = ({ last, action, title, description }) => {
  return (
    <View style={[styles.rowContainer, last && styles.lastRowContainer]}>
      <View style={{ flexShrink: 1, paddingRight: 12 }}>
        <Text style={[styles.rowTitle, { fontFamily: 'Menlo' }]}>{title}</Text>
        <Text style={{ color: 'rgb(146, 130, 170)', fontSize: 12 }}>{description}</Text>
      </View>
      <View>
        <Button secondary onPress={() => {}} title={action} />
      </View>
    </View>
  );
};

const Button = ({ onPress, title, secondary }) => {
  return (
    <View style={[styles.buttonBottomLayer, styles.buttonCommon]}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonMainContainer,
          pressed && styles.buttonMainContainerPressed,
          styles.buttonCommon,
          secondary && styles.buttonSecondaryContainer,
        ]}
        onPress={onPress}
      >
        <Text style={styles.buttonText}>{title}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
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
    padding: 20,
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
