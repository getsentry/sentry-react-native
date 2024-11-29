import React from 'react';
import type { KeyboardTypeOptions } from "react-native";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

interface FeedbackFormScreenProps {
  closeScreen: () => void;
}

export const FeedbackFormScreen: React.FC<FeedbackFormScreenProps> = ({ closeScreen }) => {

  const handleFeedbackSubmit = (): void => {
    closeScreen();
  };

  const addScreenshot = (): void => {
    Alert.alert("Info", "Attachments are not supported yet.");
    // TODO
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Feedback Form</Text>

      <TextInput
        style={styles.input}
        placeholder="Name"
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType={"email-address" as KeyboardTypeOptions}
      />

      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Description (required)"
        multiline
      />

      <TouchableOpacity style={styles.screenshotButton} onPress={addScreenshot}>
        <Text style={styles.screenshotText}>Add Screenshot</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.submitButton} onPress={handleFeedbackSubmit}>
        <Text style={styles.submitText}>Send Feedback</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={closeScreen}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    height: 50,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  screenshotButton: {
    backgroundColor: "#eee",
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
    alignItems: "center",
  },
  screenshotText: {
    color: "#333",
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: "#6a1b9a",
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: "center",
    marginBottom: 10,
  },
  submitText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: "center",
  },
  cancelText: {
    color: "#6a1b9a",
    fontSize: 16,
  },
});
