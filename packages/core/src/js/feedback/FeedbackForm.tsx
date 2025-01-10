import type { SendFeedbackParams } from '@sentry/core';
import { captureFeedback, getCurrentScope, lastEventId } from '@sentry/core';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import {
  Alert,
  Image,
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
import { sentryLogo } from './branding';
import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState, FeedbackFormStyles,FeedbackGeneralConfiguration, FeedbackTextConfiguration } from './FeedbackForm.types';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackForm extends React.Component<FeedbackFormProps, FeedbackFormState> {
  public static defaultProps: Partial<FeedbackFormProps> = {
    ...defaultConfiguration
  }

  public constructor(props: FeedbackFormProps) {
    super(props);

    const currentUser = {
      useSentryUser: {
        email: this.props?.useSentryUser?.email || getCurrentScope()?.getUser()?.email || '',
        name: this.props?.useSentryUser?.name || getCurrentScope()?.getUser()?.name || '',
      }
    }

    this.state = {
      isVisible: true,
      name: currentUser.useSentryUser.name,
      email: currentUser.useSentryUser.email,
      description: '',
    };
  }

  public handleFeedbackSubmit: () => void = () => {
    const { name, email, description } = this.state;
    const { onFormClose } = this.props;
    const text: FeedbackTextConfiguration = this.props;

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if ((this.props.isNameRequired && !trimmedName) || (this.props.isEmailRequired && !trimmedEmail) || !trimmedDescription) {
      Alert.alert(text.errorTitle, text.formError);
      return;
    }

    if (this.props.shouldValidateEmail && (this.props.isEmailRequired || trimmedEmail.length > 0) && !this._isValidEmail(trimmedEmail)) {
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

  public addRemoveScreenshot: () => void = () => {
    if (!this.state.filename && !this.state.attachment) {
      const { onAddScreenshot } = { ...defaultConfiguration, ...this.props };
      onAddScreenshot((filename: string, attachement: string | Uint8Array) => {
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
    const { onFormClose } = this.props;
    const config: FeedbackGeneralConfiguration = this.props;
    const text: FeedbackTextConfiguration = this.props;
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
              <View style={styles.titleContainer}>
                <Text style={styles.title}>{text.formTitle}</Text>
                {config.showBranding && (
                  <Image
                    source={{ uri: sentryLogo }}
                    style={styles.sentryLogo}
                    testID='sentry-logo'
                  />
                )}
              </View>

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
                <TouchableOpacity style={styles.screenshotButton} onPress={this.addRemoveScreenshot}>
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
