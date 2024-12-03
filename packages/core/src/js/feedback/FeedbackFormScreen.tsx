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

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if (!trimmedName || !trimmedEmail || !trimmedDescription) {
      const errorMessage = text?.formError || 'Please fill out all required fields.';
      Alert.alert(text?.errorTitle || 'Error', errorMessage);
      return;
    }

    if (!this._isValidEmail(trimmedEmail)) {
      const errorMessage = text?.emailError || 'Please enter a valid email address.';
      Alert.alert(text?.errorTitle || 'Error', errorMessage);
      return;
    }

    const userFeedback: SendFeedbackParams = {
      message: trimmedDescription,
      name: trimmedName,
      email: trimmedEmail,
    };

    const attachments = this.state.filename && this.state.attachment
    ? [
        {
          filename: this.state.filename,
          data: this.state.attachment,
        },
      ]
    : undefined;

    captureFeedback(userFeedback, attachments ? { attachments } : undefined);

    closeScreen();
  };

  public addAttachment: () => void = () => {
    this.props?.chooseFile((filename: string, base64Attachment: string) => {
      this.setState({ filename, attachment: base64Attachment });

      Alert.alert('Success', `File "${filename}" attached successfully.`);
    });
  }

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const { closeScreen, chooseFile, text, styles } = this.props;
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

      {chooseFile && (
        <TouchableOpacity style={styles?.attachmentButton || defaultStyles.attachmentButton} onPress={this.addAttachment}>
          <Text style={styles?.attachmentText || defaultStyles.attachmentText}>{text?.attachmentButton || 'Add Screenshot'}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles?.submitButton || defaultStyles.submitButton} onPress={this.handleFeedbackSubmit}>
        <Text style={styles?.submitText || defaultStyles.submitText}>{text?.submitButton || 'Send Feedback'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles?.cancelButton || defaultStyles.cancelButton} onPress={closeScreen}>
        <Text style={styles?.cancelText || defaultStyles.cancelText}>{text?.cancelButton || 'Cancel'}</Text>
      </TouchableOpacity>
    </View>
    );
  }

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
}
