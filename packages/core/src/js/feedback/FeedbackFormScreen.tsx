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

      {this._renderTextInput(text?.namePlaceholder || 'Name', name, (value) => this.setState({ name: value }))}
      {this._renderTextInput(text?.emailPlaceholder || 'Email', email, (value) => this.setState({ email: value }), 'email-address')}
      {this._renderTextInput(text?.descriptionPlaceholder || 'Description (required)', description, (value) => this.setState({ description: value }), undefined, true)}

      {chooseFile && this._renderButton(text?.attachmentButton || 'Add Screenshot', this.addAttachment, styles?.attachmentButton || defaultStyles.attachmentButton, styles?.attachmentText || defaultStyles.attachmentText)}

      {this._renderButton(text?.submitButton || 'Send Feedback', this.handleFeedbackSubmit, styles?.submitButton || defaultStyles.submitButton, styles?.submitText || defaultStyles.submitText)}

      {this._renderButton(text?.cancelButton || 'Cancel', closeScreen, styles?.cancelButton || defaultStyles.cancelButton, styles?.cancelText || defaultStyles.cancelText)}
    </View>
    );
  }

  private _renderTextInput = (placeholder: string, value: string, onChangeText: (value: string) => void, keyboardType?: KeyboardTypeOptions, multiline?: boolean): JSX.Element => (
    <TextInput
      style={this.props.styles?.input || defaultStyles.input}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      multiline={multiline}
    />
  );

  private _renderButton = (text: string, onPress: () => void, style: any, textStyle: any): JSX.Element => (
    <TouchableOpacity style={style} onPress={onPress}>
      <Text style={textStyle}>{text}</Text>
    </TouchableOpacity>
  );

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
}
