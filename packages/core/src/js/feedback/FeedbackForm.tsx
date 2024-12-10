import { captureFeedback } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { defaultConfiguration } from './constants';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState, FeedbackFormStyles,FeedbackGeneralConfiguration, FeedbackTextConfiguration } from './FeedbackForm.types';

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
    const { closeScreen } = this.props;
    const config: FeedbackGeneralConfiguration = { ...defaultConfiguration, ...this.props };
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if ((config.isNameRequired && !trimmedName) || (config.isEmailRequired && !trimmedEmail) || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.formError);
      return;
    }

    if (config.isEmailRequired && !this._isValidEmail(trimmedEmail)) {
      Alert.alert(text.errorTitle, text.emailError);
      return;
    }

    const userFeedback: SendFeedbackParams = {
      message: trimmedDescription,
      name: trimmedName,
      email: trimmedEmail,
    };

    closeScreen();
    captureFeedback(userFeedback);
  };

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const { closeScreen } = this.props;
    const { name, email, description } = this.state;
    const config: FeedbackGeneralConfiguration = { ...defaultConfiguration, ...this.props };
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };

    return (
    <View style={styles.container}>
      <Text style={styles.title}>{text.formTitle}</Text>

      <Text style={styles.label}>
          {text.nameLabel}
          {config.isNameRequired && ` ${text.isRequiredLabel}`}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={text.namePlaceholder}
        value={name}
        onChangeText={(value) => this.setState({ name: value })}
        />

      <Text style={styles.label}>
          {text.emailLabel}
          {config.isEmailRequired && ` ${text.isRequiredLabel}`}
      </Text>
      <TextInput
        style={styles.input}
        placeholder={text.emailPlaceholder}
        keyboardType={'email-address' as KeyboardTypeOptions}
        value={email}
        onChangeText={(value) => this.setState({ email: value })}
        />

      <Text style={styles.label}>
        {text.messageLabel}
        {` ${text.isRequiredLabel}`}
      </Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder={text.messagePlaceholder}
        value={description}
        onChangeText={(value) => this.setState({ description: value })}
        multiline
      />

      <TouchableOpacity style={styles.submitButton} onPress={this.handleFeedbackSubmit}>
        <Text style={styles.submitText}>{text.submitButtonLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={closeScreen}>
        <Text style={styles.cancelText}>{text.cancelButtonLabel}</Text>
      </TouchableOpacity>
    </View>
    );
  }

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
}
