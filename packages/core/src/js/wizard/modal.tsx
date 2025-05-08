import { on } from 'events';
import * as React from 'react';
import { Modal, SafeAreaView, View, Image, Pressable, Text, StyleSheet } from 'react-native';

export const Wizard = () => {
  const [show, setShow] = React.useState(true);

  return (
    <Modal
      presentationStyle='formSheet'
      visible={show}
      animationType='slide'
      onRequestClose={() => {
        setShow(false);
      }}>
      <SafeAreaView style={styles.background}>
        <View style={styles.container}>
          <Image
            source={require('../../../images/hi.gif')}
            style={{ width: 100, height: 100 }}
          />
          <View style={styles.listContainer}>
            <Row action={'Capture'}/>
            <Row action={'Try'}/>
            <Row action={'Crash'} last />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const Row = ({last, action}) => {
  return (
    <View style={[styles.rowContainer, last && styles.lastRowContainer]}>
      <View>
        <Text style={styles.rowTitle}>{action}</Text>
        <Text style={{ color: 'rgb(177, 177, 177)' }}>
          Lorem ipsum dolor sit amet.
        </Text>
      </View>
      <Button onPress={() => {}} title={action} />
    </View>
  );
};

const Button = ({ onPress, title }) => {
  return (
    <View style={[styles.buttonBottomLayer, styles.buttonCommon]}>
      <Pressable
        style={({ pressed }) => [
          styles.buttonMainContainer,
          pressed && styles.buttonMainContainerPressed,
          styles.buttonCommon,
          styles.buttonSecondaryContainer,
        ]}
        onPress={onPress}
      >
        <Text style={styles.buttonText}>{title}</Text>
      </Pressable>
    </View>
  );
}

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
    padding: 20,
    marginTop: 20,
    width: '100%',
    alignItems: 'center', // Center image and button container
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
    borderRadius  : 8,
  },
  rowTitle: {
    color: 'rgb(246, 245, 250)',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'left',
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between', // Space between buttons
    paddingTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderColor: 'rgb(7, 5, 15)',
    borderBottomWidth: 1
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
