import { captureFeedback, getCurrentScope, lastEventId } from '@sentry/core';
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

import { base64ToUint8Array } from '../utils/base64ToUint8Array';
import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState, FeedbackFormStyles,FeedbackGeneralConfiguration, FeedbackTextConfiguration } from './FeedbackForm.types';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackForm extends React.Component<FeedbackFormProps, FeedbackFormState> {
  private _config: FeedbackFormProps;

  public constructor(props: FeedbackFormProps) {
    super(props);

    const currentUser = {
      useSentryUser: {
        email: getCurrentScope().getUser().email || '',
        name: getCurrentScope().getUser().name || '',
      }
    }

    this._config = { ...defaultConfiguration, ...currentUser, ...props };
    this.state = {
      isVisible: true,
      name: this._config.useSentryUser.name,
      email: this._config.useSentryUser.email,
      description: '',
    };
  }

  public handleFeedbackSubmit: () => void = () => {
    const { name, email, description } = this.state;
    const { onFormClose } = this._config;
    const text: FeedbackTextConfiguration = this._config;

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if ((this._config.isNameRequired && !trimmedName) || (this._config.isEmailRequired && !trimmedEmail) || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.formError);
      return;
    }

    if (this._config.shouldValidateEmail && (this._config.isEmailRequired || trimmedEmail.length > 0) && !this._isValidEmail(trimmedEmail)) {
      Alert.alert(text.errorTitle, text.emailError);
      return;
    }

    const attachement = (this.state?.attachment instanceof Uint8Array)? this.state?.attachment : base64ToUint8Array(this.state?.attachment);

    const attachments = this.state.filename && this.state.attachment
    ? [
        {
          filename: this.state.filename,
          data: attachement,
        },
      ]
    : undefined;

    const eventId = lastEventId();
    const userFeedback: SendFeedbackParams = {
      message: trimmedDescription,
      name: trimmedName,
      email: trimmedEmail,
      associatedEventId: eventId,
    };

    onFormClose();
    this.setState({ isVisible: false });

    captureFeedback(userFeedback, attachments ? { attachments } : undefined);
    Alert.alert(text.successMessageText);
  };

  public addRemoveAttachment: () => void = () => {
    if (!this.state.filename && !this.state.attachment) {
      const { onFileChosen } = { ...defaultConfiguration, ...this.props };
      onFileChosen((filename: string, attachement: string | Uint8Array) => {
        this.setState({ filename, attachment: attachement });
      });
    } else {
      this.setState({ filename: undefined, attachment: undefined });
    }
  }

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const { name, email, description } = this.state;
    const { onFormClose } = this._config;
    const config: FeedbackGeneralConfiguration = this._config;
    const text: FeedbackTextConfiguration = this._config;
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };
    const onCancel = (): void => {
      onFormClose();
      this.setState({ isVisible: false });
    }

    if (!this.state.isVisible) {
      return null;
    }

    return (
    <SafeAreaView style={[styles.container, { padding: 0 }]}>
      <KeyboardAvoidingView behavior={'padding'} style={[styles.container, { padding: 0 }]}>
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

              {config.enableScreenshot && (
                <TouchableOpacity style={styles.screenshotButton} onPress={this.addRemoveAttachment}>
                  <Text style={styles.screenshotText}>
                  {!this.state.filename && !this.state.attachment
                    ? text.addScreenshotButtonLabel
                    : text.removeScreenshotButtonLabel}
                  </Text>
                </TouchableOpacity>
              )}

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
