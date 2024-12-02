import { captureFeedback } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions, TextStyle,ViewStyle } from 'react-native';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface FeedbackFormScreenProps {
  closeScreen: () => void;
  text: FeedbackFormText;
  styles?: FeedbackFormScreenStyles;
}

interface FeedbackFormText {
  formTitle?: string;
  namePlaceholder?: string;
  emailPlaceholder?: string;
  descriptionPlaceholder?: string;
  addAttachmentButton?: string;
  submitButton?: string;
  cancelButton?: string;
  formError?: string;
}

interface FeedbackFormScreenStyles {
  container?: ViewStyle;
  title?: TextStyle;
  input?: TextStyle;
  textArea?: ViewStyle;
  screenshotButton?: ViewStyle;
  screenshotText?: TextStyle;
  submitButton?: ViewStyle;
  submitText?: TextStyle;
  cancelButton?: ViewStyle;
  cancelText?: TextStyle;
}

interface FeedbackFormScreenState {
  name: string;
  email: string;
  description: string;
}

const defaultStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  screenshotButton: {
    backgroundColor: '#eee',
    padding: 15,
    borderRadius: 5,
    marginBottom: 20,
    alignItems: 'center',
  },
  screenshotText: {
    color: '#333',
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#6a1b9a',
    paddingVertical: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: '#6a1b9a',
    fontSize: 16,
  },
});

/**
 *
 */
export class FeedbackFormScreen extends React.Component<FeedbackFormScreenProps, FeedbackFormScreenState> {
  public constructor(props: FeedbackFormScreenProps) {
    super(props);
    this.state = {
      name: '',
      email: '',
      description: '',
    };
  }

  public handleFeedbackSubmit: () => void = () => {
    const { name, email, description } = this.state;
    const { closeScreen, text } = this.props;

    if (!name || !email || !description) {
      const errorMessage = text?.formError || 'Please fill out all required fields.';
      Alert.alert('Error', errorMessage);
      return;
    }

    const userFeedback: SendFeedbackParams = {
      message: description,
      name,
      email,
    };

    captureFeedback(userFeedback);
    closeScreen();
  };

  public addScreenshot: () => void = () => {
    Alert.alert('Info', 'Attachments are not supported yet.');
    // TODO
  };

  /**
   *
   */
  public render(): React.ReactNode {
    const { closeScreen, text, styles } = this.props;
    const { name, email, description } = this.state;

    return (
    <View style={styles?.container || defaultStyles.container}>
      <Text style={styles?.title || defaultStyles.title}>{text?.formTitle || 'Feedback Form'}</Text>

      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.namePlaceholder || 'Name'}
        value={name}
        onChangeText={(value) => this.setState({ name: value })}
        />

      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.emailPlaceholder || 'Email'}
        keyboardType={'email-address' as KeyboardTypeOptions}
        value={email}
        onChangeText={(value) => this.setState({ email: value })}
        />

      <TextInput
        style={[styles?.input || defaultStyles.input, styles?.textArea || defaultStyles.textArea]}
        placeholder={text?.descriptionPlaceholder || 'Description (required)'}
        value={description}
        onChangeText={(value) => this.setState({ description: value })}
        multiline
      />

      <TouchableOpacity style={styles?.screenshotButton || defaultStyles.screenshotButton} onPress={this.addScreenshot}>
        <Text style={styles?.screenshotText || defaultStyles.screenshotText}>{text?.addAttachmentButton || 'Add Screenshot'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles?.submitButton || defaultStyles.submitButton} onPress={this.handleFeedbackSubmit}>
        <Text style={styles?.submitText || defaultStyles.submitText}>{text?.submitButton || 'Send Feedback'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles?.cancelButton || defaultStyles.cancelButton} onPress={closeScreen}>
        <Text style={styles?.cancelText || defaultStyles.cancelText}>{text?.cancelButton || 'Cancel'}</Text>
      </TouchableOpacity>
    </View>
    );
  }
}
