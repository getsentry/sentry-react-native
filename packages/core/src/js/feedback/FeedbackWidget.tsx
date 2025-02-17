import type { SendFeedbackParams } from '@sentry/core';
import { captureFeedback, getCurrentScope, lastEventId, logger } from '@sentry/core';
import * as React from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import {
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { isWeb } from '../utils/environment';
import { NATIVE } from '../wrapper';
import { sentryLogo } from './branding';
import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackWidget.styles';
import type { FeedbackGeneralConfiguration, FeedbackTextConfiguration, FeedbackWidgetProps, FeedbackWidgetState, FeedbackWidgetStyles, ImagePickerConfiguration } from './FeedbackWidget.types';
import { base64ToUint8Array, feedbackAlertDialog, isValidEmail  } from './utils';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackWidget extends React.Component<FeedbackWidgetProps, FeedbackWidgetState> {
  public static defaultProps: Partial<FeedbackWidgetProps> = {
    ...defaultConfiguration
  }

  private static _didSubmitForm: boolean = false;
  private static _savedState: Omit<FeedbackWidgetState, 'isVisible'> = {
    name: '',
    email: '',
    description: '',
    filename: undefined,
    attachment: undefined,
    attachmentUri: undefined,
  };

  public constructor(props: FeedbackWidgetProps) {
    super(props);

    const currentUser = {
      useSentryUser: {
        email: this.props?.useSentryUser?.email || getCurrentScope()?.getUser()?.email || '',
        name: this.props?.useSentryUser?.name || getCurrentScope()?.getUser()?.name || '',
      }
    }

    this.state = {
      isVisible: true,
      name: FeedbackWidget._savedState.name || currentUser.useSentryUser.name,
      email: FeedbackWidget._savedState.email || currentUser.useSentryUser.email,
      description: FeedbackWidget._savedState.description || '',
      filename: FeedbackWidget._savedState.filename || undefined,
      attachment: FeedbackWidget._savedState.attachment || undefined,
      attachmentUri: FeedbackWidget._savedState.attachmentUri || undefined,
    };
  }

  public handleFeedbackSubmit: () => void = () => {
    const { name, email, description } = this.state;
    const { onSubmitSuccess, onSubmitError, onFormSubmitted } = this.props;
    const text: FeedbackTextConfiguration = this.props;

    const trimmedName = name?.trim();
    const trimmedEmail = email?.trim();
    const trimmedDescription = description?.trim();

    if ((this.props.isNameRequired && !trimmedName) || (this.props.isEmailRequired && !trimmedEmail) || !trimmedDescription) {
      feedbackAlertDialog(text.errorTitle, text.formError);
      return;
    }

    if (this.props.shouldValidateEmail && (this.props.isEmailRequired || trimmedEmail.length > 0) && !isValidEmail(trimmedEmail)) {
      feedbackAlertDialog(text.errorTitle, text.emailError);
      return;
    }

    const attachments = this.state.filename && this.state.attachment
    ? [
        {
          filename: this.state.filename,
          data: this.state.attachment,
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

    try {
      if (!onFormSubmitted) {
        this.setState({ isVisible: false });
      }
      captureFeedback(userFeedback, attachments ? { attachments } : undefined);
      onSubmitSuccess({ name: trimmedName, email: trimmedEmail, message: trimmedDescription, attachments: attachments });
      feedbackAlertDialog(text.successMessageText , '');
      onFormSubmitted();
      FeedbackWidget._didSubmitForm = true;
    } catch (error) {
      const errorString = `Feedback form submission failed: ${error}`;
      onSubmitError(new Error(errorString));
      feedbackAlertDialog(text.errorTitle, text.genericError);
      logger.error(`Feedback form submission failed: ${error}`);
    }
  };

  public onScreenshotButtonPress: () => void = async () => {
    if (!this.state.filename && !this.state.attachment) {
      const imagePickerConfiguration: ImagePickerConfiguration = this.props;
      if (imagePickerConfiguration.imagePicker) {
        const launchImageLibrary = imagePickerConfiguration.imagePicker.launchImageLibraryAsync
          // expo-image-picker library is available
          ? () => imagePickerConfiguration.imagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: isWeb() })
          // react-native-image-picker library is available
          : imagePickerConfiguration.imagePicker.launchImageLibrary
            ? () => imagePickerConfiguration.imagePicker.launchImageLibrary({ mediaType: 'photo', includeBase64: isWeb() })
            : null;
        if (!launchImageLibrary) {
          logger.warn('No compatible image picker library found. Please provide a valid image picker library.');
          if (__DEV__) {
            feedbackAlertDialog(
              'Development note',
              'No compatible image picker library found. Please provide a compatible version of `expo-image-picker` or `react-native-image-picker`.',
            );
          }
          return;
        }

        const result = await launchImageLibrary();
        if (result.assets && result.assets.length > 0) {
          if (isWeb()) {
            const filename = result.assets[0].fileName;
            const imageUri = result.assets[0].uri;
            const base64 = result.assets[0].base64;
            const data = base64ToUint8Array(base64);
            if (data != null) {
              this.setState({ filename, attachment: data, attachmentUri: imageUri });
            } else {
              logger.error('Failed to read image data on the web');
            }
          } else {
            const filename = result.assets[0].fileName;
            const imageUri = result.assets[0].uri;
            NATIVE.getDataFromUri(imageUri).then((data) => {
              if (data != null) {
                this.setState({ filename, attachment: data, attachmentUri: imageUri });
              } else {
                logger.error('Failed to read image data from uri:', imageUri);
              }
            }).catch((error) => {
              logger.error('Failed to read image data from uri:', imageUri, 'error: ', error);
            });
          }
        }
      } else {
        // Defaulting to the onAddScreenshot callback
        const { onAddScreenshot } = { ...defaultConfiguration, ...this.props };
        onAddScreenshot((uri: string) => {
          NATIVE.getDataFromUri(uri).then((data) => {
            if (data != null) {
              this.setState({ filename: 'feedback_screenshot', attachment: data, attachmentUri: uri });
            } else {
              logger.error('Failed to read image data from uri:', uri);
            }
          })
          .catch((error) => {
            logger.error('Failed to read image data from uri:', uri, 'error: ', error);
          });
        });
      }
    } else {
      this.setState({ filename: undefined, attachment: undefined, attachmentUri: undefined });
    }
  }

  /**
   * Save the state before unmounting the component.
   */
  public componentWillUnmount(): void {
    if (FeedbackWidget._didSubmitForm) {
      this._clearFormState();
      FeedbackWidget._didSubmitForm = false;
    } else {
      this._saveFormState();
    }
  }

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const { name, email, description } = this.state;
    const { onFormClose } = this.props;
    const config: FeedbackGeneralConfiguration = this.props;
    const imagePickerConfiguration: ImagePickerConfiguration = this.props;
    const text: FeedbackTextConfiguration = this.props;
    const styles: FeedbackWidgetStyles = { ...defaultStyles, ...this.props.styles };
    const onCancel = (): void => {
      if (onFormClose) {
        onFormClose();
      } else {
        this.setState({ isVisible: false });
      }
    }

    if (!this.state.isVisible) {
      return null;
    }

    return (
    <SafeAreaView style={[styles.container, { padding: 0 }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { padding: 0 }]}
      >
        <ScrollView bounces={false}>
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
              {(config.enableScreenshot || imagePickerConfiguration.imagePicker) && (
                <View style={styles.screenshotContainer}>
                  {this.state.attachmentUri && (
                    <Image
                      source={{ uri: this.state.attachmentUri }}
                      style={styles.screenshotThumbnail}
                    />
                  )}
                  <TouchableOpacity style={styles.screenshotButton} onPress={this.onScreenshotButtonPress}>
                    <Text style={styles.screenshotText}>
                      {!this.state.filename && !this.state.attachment
                        ? text.addScreenshotButtonLabel
                        : text.removeScreenshotButtonLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
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

  private _saveFormState = (): void => {
    FeedbackWidget._savedState = { ...this.state };
  };

  private _clearFormState = (): void => {
    FeedbackWidget._savedState = {
      name: '',
      email: '',
      description: '',
      filename: undefined,
      attachment: undefined,
      attachmentUri: undefined,
    };
  };
}
