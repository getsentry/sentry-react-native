import React, { useState } from 'react';
import { View, Modal, StyleSheet, Text, TouchableOpacity, TextInput, Image } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { UserFeedback } from '@sentry/react-native';
import { styles as homeScreenStyles } from '../screens/HomeScreen';

export const DEFAULT_COMMENTS = `It's broken again! Please fix it.`;

export function UserFeedbackModal() {
  const [comments, onChangeComments] = React.useState(DEFAULT_COMMENTS);
  const [modalVisible, setModalVisible] = useState(false);
  const clearComments = () => onChangeComments(DEFAULT_COMMENTS);

  return (
    <View>
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => {
        setModalVisible(!modalVisible);
      }}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Image
            source={require('../assets/sentry-announcement.png')}
            style={styles.modalImage}
          />
          <Text style={styles.modalText}>Whoops, what happened?</Text>
          <TextInput
            style={styles.input}
            onChangeText={onChangeComments}
            value={comments}
            multiline={true}
            numberOfLines={4}
          />
          <TouchableOpacity
            onPress={async () => {
              setModalVisible(!modalVisible);

              const sentryId = Sentry.captureMessage('Message that needs user feedback');

              const userFeedback: UserFeedback = {
                event_id: sentryId,
                name: 'John Doe',
                email: 'john@doe.com',
                comments,
              };

              Sentry.captureUserFeedback(userFeedback);
              clearComments();
            }}>
            <Text style={homeScreenStyles.buttonText}>Send feedback</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              setModalVisible(!modalVisible);
            }}>
            <Text style={homeScreenStyles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    <TouchableOpacity
      onPress={async () => {
        setModalVisible(true);
      }}>
      <Text style={homeScreenStyles.buttonText}>Send user feedback</Text>
    </TouchableOpacity>
  </View>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalView: {
    margin: 5,
    backgroundColor: "white",
    borderRadius: 6,
    padding: 25,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  input: {
    margin: 12,
    marginBottom: 20,
    borderWidth: 0.5,
    borderColor: '#c6becf',
    padding: 15,
    borderRadius: 6,
    height: 100,
    width: 250,
    textAlignVertical: 'top',
  },
  modalText: {
    marginBottom: 15,
    textAlign: "center",
    fontSize: 18,
  },
  modalImage: {
    marginBottom: 20,
    width: 80,
    height: 80,
  }
});
