import React from 'react';
import { View, StyleSheet, Text, TextInput, Image, Button } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { UserFeedback } from '@sentry/react-native';

export const DEFAULT_COMMENTS = "It's broken again! Please fix it.";

export function UserFeedbackModal(props: { onDismiss: () => void }) {
  const { onDismiss } = props;
  const [comments, onChangeComments] = React.useState(DEFAULT_COMMENTS);
  const clearComments = () => onChangeComments(DEFAULT_COMMENTS);

  return (
    <View>
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
          <Button
            title="Send feedback"
            color="#6C5FC7"
            onPress={async () => {
              onDismiss();

              const sentryId = Sentry.captureMessage(
                'Message that needs user feedback',
              );

              const userFeedback: UserFeedback = {
                event_id: sentryId,
                name: 'John Doe',
                email: 'john@doe.com',
                comments,
              };

              Sentry.captureUserFeedback(userFeedback);
              clearComments();
            }}
          />
          <View style={styles.buttonSpacer} />
          <Button
            title="Close"
            color="#6C5FC7"
            onPress={async () => {
              onDismiss();
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalView: {
    margin: 5,
    backgroundColor: 'white',
    borderRadius: 6,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
    textAlign: 'center',
    fontSize: 18,
  },
  modalImage: {
    marginBottom: 20,
    width: 80,
    height: 80,
  },
  buttonSpacer: {
    marginBottom: 8,
  },
});
