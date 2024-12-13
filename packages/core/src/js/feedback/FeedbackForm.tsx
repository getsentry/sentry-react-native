import { captureFeedback, lastEventId } from '@sentry/core';
import type { SendFeedbackParams } from '@sentry/types';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState, FeedbackFormStyles,FeedbackGeneralConfiguration, FeedbackTextConfiguration } from './FeedbackForm.types';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackForm extends React.Component<FeedbackFormProps, FeedbackFormState> {
  public constructor(props: FeedbackFormProps) {
    super(props);

    const config: FeedbackGeneralConfiguration = { ...defaultConfiguration, ...props };
    this.state = {
      isVisible: true,
      name: config.useSentryUser.name,
      email: config.useSentryUser.email,
      description: '',
    };
  }

  public handleFeedbackSubmit: () => void = () => {
    const { name, email, description } = this.state;
    const { onFormClose } = { ...defaultConfiguration, ...this.props };
    const config: FeedbackGeneralConfiguration = { ...defaultConfiguration, ...this.props };
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if ((config.isNameRequired && !trimmedName) || (config.isEmailRequired && !trimmedEmail) || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.formError);
      return;
    }

    if ((config.isEmailRequired || trimmedEmail.length > 0) && !this._isValidEmail(trimmedEmail)) {
      Alert.alert(text.errorTitle, text.emailError);
      return;
    }

    const eventId = lastEventId();
    const userFeedback: SendFeedbackParams = {
      message: trimmedDescription,
      name: trimmedName,
      email: trimmedEmail,
      associatedEventId: eventId,
    };

    onFormClose();
    this.setState({ isVisible: false });

    captureFeedback(userFeedback);
    Alert.alert(text.successMessageText);
  };

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const { name, email, description } = this.state;
    const { onFormClose } = { ...defaultConfiguration, ...this.props };
    const config: FeedbackGeneralConfiguration = { ...defaultConfiguration, ...this.props };
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };
    const onCancel = (): void => {
      onFormClose();
      this.setState({ isVisible: false });
    }

    if (!this.state.isVisible) {
      return null;
    }

    return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={'padding'} style={styles.container}>
        <ScrollView>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
              <Text style={styles.title}>{text.formTitle}</Text>

              {config.showName && (
              <>
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
              </>
              )}

              {config.showEmail && (
              <>
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
              </>
              )}

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

              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelText}>{text.cancelButtonLabel}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    );
  }

  private _isValidEmail = (email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(email);
  };
}
