import { captureFeedback } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState } from './FeedbackForm.types';

const defaultFormTitle = 'Feedback Form';
const defaultNamePlaceholder ='Name';
const defaultEmailPlaceholder = 'Email';
const defaultDescriptionPlaceholder = 'Description (required)';
const defaultSubmitButton = 'Send Feedback';
const defaultCancelButton = 'Cancel';
const defaultErrorTitle = 'Error';
const defaultFormError = 'Please fill out all required fields.';
const defaultEmailError = 'Please enter a valid email address.';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackForm extends React.Component<FeedbackFormProps, FeedbackFormState> {
  public constructor(props: FeedbackFormProps) {
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
      const errorMessage = text?.formError || defaultFormError;
      Alert.alert(text?.errorTitle || defaultErrorTitle, errorMessage);
      return;
    }

    if (!this._isValidEmail(trimmedEmail)) {
      const errorMessage = text?.emailError || defaultEmailError;
      Alert.alert(text?.errorTitle || defaultErrorTitle, errorMessage);
      return;
    }

    const userFeedback: SendFeedbackParams = {
      message: trimmedDescription,
      name: trimmedName,
      email: trimmedEmail,
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
      <Text style={styles?.title || defaultStyles.title}>{text?.formTitle || defaultFormTitle}</Text>

      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.namePlaceholder || defaultNamePlaceholder}
        value={name}
        onChangeText={(value) => this.setState({ name: value })}
        />

      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.emailPlaceholder || defaultEmailPlaceholder}
        keyboardType={'email-address' as KeyboardTypeOptions}
        value={email}
        onChangeText={(value) => this.setState({ email: value })}
        />

      <TextInput
        style={[styles?.input || defaultStyles.input, styles?.textArea || defaultStyles.textArea]}
        placeholder={text?.descriptionPlaceholder || defaultDescriptionPlaceholder}
        value={description}
        onChangeText={(value) => this.setState({ description: value })}
        multiline
      />

      <TouchableOpacity style={styles?.submitButton || defaultStyles.submitButton} onPress={this.handleFeedbackSubmit}>
        <Text style={styles?.submitText || defaultStyles.submitText}>{text?.submitButton || defaultSubmitButton}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles?.cancelButton || defaultStyles.cancelButton} onPress={closeScreen}>
        <Text style={styles?.cancelText || defaultStyles.cancelText}>{text?.cancelButton || defaultCancelButton}</Text>
      </TouchableOpacity>
    </View>
    );
  }

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
}
