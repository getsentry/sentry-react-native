import type { SendFeedbackParams } from '@sentry/core';
import { captureFeedback, getCurrentScope, lastEventId, logger } from '@sentry/core';
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

import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackForm.styles';
import type { FeedbackFormProps, FeedbackFormState, FeedbackFormStyles,FeedbackGeneralConfiguration, FeedbackTextConfiguration, Navigation } from './FeedbackForm.types';
import { feedbackIcon }  from './icons';

let feedbackFormHandler: (() => void) | null = null;

const setFeedbackFormHandler = (handler: () => void): void => {
  feedbackFormHandler = handler;
};

const clearFeedbackFormHandler = (): void => {
  feedbackFormHandler = null;
};

/**
 * @beta
 * Shows the feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 * @param navigation The navigation object from React Navigation
 */
export const showFeedbackForm = (navigation: Navigation): void => {
  setFeedbackFormHandler(() => {
    navigation?.navigate?.('FeedbackForm');
  });
  if (feedbackFormHandler) {
    feedbackFormHandler();
  } else {
    logger.error('FeedbackForm handler is not set. Please ensure it is initialized.');
  }
};

/**
 * @beta
 * Implements a feedback button that opens the feedback form screen to Sentry using Sentry.captureFeedback.
 */
export class FeedbackButton extends React.Component<FeedbackFormProps> {
  /**
   *
   */
  public render(): React.ReactNode {
    const text: FeedbackTextConfiguration = { ...defaultConfiguration, ...this.props };
    const styles: FeedbackFormStyles = { ...defaultStyles, ...this.props.styles };

    return (
      <TouchableOpacity
        style={styles.triggerButton}
        onPress={() => showFeedbackForm(this.props?.navigation)}
        accessibilityLabel={text.triggerAriaLabel}
      >
        <Image source={{ uri: feedbackIcon }} style={styles.triggerIcon}/>
        <Text style={styles.triggerText}>{text.triggerLabel}</Text>
      </TouchableOpacity>
    );
  }
}

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

  /**
   * Clear the handler when the component unmounts
   */
  public componentWillUnmount(): void {
    clearFeedbackFormHandler();
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
