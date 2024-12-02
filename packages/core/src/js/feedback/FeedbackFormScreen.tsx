import { captureFeedback } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import defaultStyles from './FeedbackFormScreen.styles';
import type { FeedbackFormScreenProps, FeedbackFormScreenState } from './FeedbackFormScreen.types';

/**
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
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

  /**
   * Renders the feedback form screen.
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
