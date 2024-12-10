import { captureFeedback } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  CANCEL_BUTTON_LABEL,
  EMAIL_ERROR,
  EMAIL_LABEL,
  EMAIL_PLACEHOLDER,
  ERROR_TITLE,
  FORM_ERROR,
  FORM_TITLE,
  IS_REQUIRED_LABEL,
  MESSAGE_LABEL,
  MESSAGE_PLACEHOLDER,
  NAME_LABEL,
  NAME_PLACEHOLDER,
  SUBMIT_BUTTON_LABEL} from './constants';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState } from './FeedbackForm.types';
import LabelText from './LabelText';

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
      const errorMessage = text?.formError || FORM_ERROR;
      Alert.alert(text?.errorTitle || ERROR_TITLE, errorMessage);
      return;
    }

    if (!this._isValidEmail(trimmedEmail)) {
      const errorMessage = text?.emailError || EMAIL_ERROR;
      Alert.alert(text?.errorTitle || ERROR_TITLE, errorMessage);
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
    const { closeScreen, text, styles } = this.props;
    const { name, email, description } = this.state;

    return (
    <View style={styles?.container || defaultStyles.container}>
      <Text style={styles?.title || defaultStyles.title}>{text?.formTitle || FORM_TITLE}</Text>

      <LabelText
          label={text?.nameLabel || NAME_LABEL}
          isRequired={true}
          isRequiredLabel={text?.isRequiredLabel || IS_REQUIRED_LABEL}
          styles={styles?.label || defaultStyles.label}
        />
      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.namePlaceholder || NAME_PLACEHOLDER}
        value={name}
        onChangeText={(value) => this.setState({ name: value })}
        />
      <LabelText
          label={text?.emailLabel || EMAIL_LABEL}
          isRequired={true}
          isRequiredLabel={text?.isRequiredLabel || IS_REQUIRED_LABEL}
          styles={styles?.label || defaultStyles.label}
        />
      <TextInput
        style={styles?.input || defaultStyles.input}
        placeholder={text?.emailPlaceholder || EMAIL_PLACEHOLDER}
        keyboardType={'email-address' as KeyboardTypeOptions}
        value={email}
        onChangeText={(value) => this.setState({ email: value })}
        />
      <LabelText
          label={text?.descriptionLabel || MESSAGE_LABEL}
          isRequired={true}
          isRequiredLabel={text?.isRequiredLabel || IS_REQUIRED_LABEL}
          styles={styles?.label || defaultStyles.label}
        />
      <TextInput
        style={[styles?.input || defaultStyles.input, styles?.textArea || defaultStyles.textArea]}
        placeholder={text?.descriptionPlaceholder || MESSAGE_PLACEHOLDER}
        value={description}
        onChangeText={(value) => this.setState({ description: value })}
        multiline
      />

      <TouchableOpacity style={styles?.submitButton || defaultStyles.submitButton} onPress={this.handleFeedbackSubmit}>
        <Text style={styles?.submitText || defaultStyles.submitText}>{text?.submitButton || SUBMIT_BUTTON_LABEL}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles?.cancelButton || defaultStyles.cancelButton} onPress={closeScreen}>
        <Text style={styles?.cancelText || defaultStyles.cancelText}>{text?.cancelButton || CANCEL_BUTTON_LABEL}</Text>
      </TouchableOpacity>
    </View>
    );
  }

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
}
