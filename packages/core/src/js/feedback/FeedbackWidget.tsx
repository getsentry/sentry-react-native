/* eslint-disable max-lines */
import type { SendFeedbackParams } from '@sentry/core';
import { captureFeedback, getCurrentScope, lastEventId, logger } from '@sentry/core';
import * as React from 'react';
import type { KeyboardTypeOptions ,
  NativeEventSubscription} from 'react-native';
import {
  Appearance,
  Image,
  Keyboard,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { isWeb, notWeb } from '../utils/environment';
import type { Screenshot } from '../wrapper';
import { getDataFromUri, NATIVE } from '../wrapper';
import { sentryLogo } from './branding';
import { defaultConfiguration } from './defaults';
import defaultStyles from './FeedbackWidget.styles';
import { getTheme } from './FeedbackWidget.theme';
import type { FeedbackGeneralConfiguration, FeedbackTextConfiguration, FeedbackWidgetProps, FeedbackWidgetState, FeedbackWidgetStyles, ImagePickerConfiguration } from './FeedbackWidget.types';
import { hideFeedbackButton, showScreenshotButton } from './FeedbackWidgetManager';
import { lazyLoadFeedbackIntegration } from './lazy';
import { getCapturedScreenshot } from './ScreenshotButton';
import { base64ToUint8Array, feedbackAlertDialog, isValidEmail  } from './utils';

/**
 * @beta
 * Implements a feedback form screen that sends feedback to Sentry using Sentry.captureFeedback.
 */
export class FeedbackWidget extends React.Component<FeedbackWidgetProps, FeedbackWidgetState> {
  public static defaultProps: Partial<FeedbackWidgetProps> = {
    ...defaultConfiguration
  }

  private static _savedState: Omit<FeedbackWidgetState, 'isVisible'> = {
    name: '',
    email: '',
    description: '',
    filename: undefined,
    attachment: undefined,
    attachmentUri: undefined,
  };

  private _themeListener: NativeEventSubscription;

  private _didSubmitForm: boolean = false;

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

    lazyLoadFeedbackIntegration();
  }

  /**
   * For testing purposes only.
   */
  public static reset(): void {
    FeedbackWidget._savedState = {
      name: '',
      email: '',
      description: '',
      filename: undefined,
      attachment: undefined,
      attachmentUri: undefined,
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
      this._didSubmitForm = true;
    } catch (error) {
      const errorString = `Feedback form submission failed: ${error}`;
      onSubmitError(new Error(errorString));
      feedbackAlertDialog(text.errorTitle, text.genericError);
      logger.error(`Feedback form submission failed: ${error}`);
    }
  };

  public onScreenshotButtonPress: () => void = async () => {
    if (!this._hasScreenshot()) {
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
            getDataFromUri(imageUri).then((data) => {
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
          getDataFromUri(uri).then((data) => {
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
   * Add a listener to the theme change event.
   */
  public componentDidMount(): void {
    this._themeListener = Appearance.addChangeListener(() => {
      this.forceUpdate();
    });
  }

  /**
   * Save the state before unmounting the component and remove the theme listener.
   */
  public componentWillUnmount(): void {
    if (this._didSubmitForm) {
      this._clearFormState();
      this._didSubmitForm = false;
    } else {
      this._saveFormState();
    }
    if (this._themeListener) {
      this._themeListener.remove();
    }
  }

  /**
   * Renders the feedback form screen.
   */
  public render(): React.ReactNode {
    const theme = getTheme();
    const { name, email, description } = this.state;
    const { onFormClose } = this.props;
    const config: FeedbackGeneralConfiguration = this.props;
    const imagePickerConfiguration: ImagePickerConfiguration = this.props;
    const text: FeedbackTextConfiguration = this.props;
    const styles: FeedbackWidgetStyles = { ...defaultStyles(theme), ...this.props.styles };
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

    const screenshot = getCapturedScreenshot();
    if (screenshot === 'ErrorCapturingScreenshot') {
      setTimeout(async () => {
        feedbackAlertDialog(text.errorTitle, text.captureScreenshotError);
      }, 100);
    } else if (screenshot) {
      this._setCapturedScreenshot(screenshot);
    }

    return (
      <TouchableWithoutFeedback
        onPress={notWeb() ? Keyboard.dismiss : undefined}
        accessible={false}
        accessibilityElementsHidden={false}
        >
        <View style={styles.container}>
          <View style={styles.titleContainer}>
            <Text style={styles.title} testID='sentry-feedback-form-title'>{text.formTitle}</Text>
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
              testID='sentry-feedback-name-input'
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
              testID='sentry-feedback-email-input'
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
            testID='sentry-feedback-message-input'
            placeholder={text.messagePlaceholder}
            value={description}
            onChangeText={(value) => this.setState({ description: value })}
            multiline
          />
          {(config.enableScreenshot || imagePickerConfiguration.imagePicker || this._hasScreenshot()) && (
            <View style={styles.screenshotContainer}>
              {this.state.attachmentUri && (
                <Image
                  source={{ uri: this.state.attachmentUri }}
                  style={styles.screenshotThumbnail}
                />
              )}
              <TouchableOpacity style={styles.screenshotButton} onPress={this.onScreenshotButtonPress}>
                <Text style={styles.screenshotText}>
                  {!this._hasScreenshot()
                    ? text.addScreenshotButtonLabel
                    : text.removeScreenshotButtonLabel}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {notWeb() && config.enableTakeScreenshot && !this.state.attachmentUri && (
            <TouchableOpacity style={styles.takeScreenshotButton} onPress={() => {
              hideFeedbackButton();
              onCancel();
              showScreenshotButton();
            }}>
              <Text style={styles.takeScreenshotText}>{text.captureScreenshotButtonLabel}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitButton} onPress={this.handleFeedbackSubmit}>
            <Text style={styles.submitText} testID='sentry-feedback-submit-button'>{text.submitButtonLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>{text.cancelButtonLabel}</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  private _setCapturedScreenshot = (screenshot: Screenshot): void => {
    if (screenshot.data != null) {
      logger.debug('Setting captured screenshot:', screenshot.filename);
      NATIVE.encodeToBase64(screenshot.data).then((base64String) => {
        if (base64String != null) {
          const dataUri = `data:${screenshot.contentType};base64,${base64String}`;
          this.setState({ filename: screenshot.filename, attachment: screenshot.data, attachmentUri: dataUri });
        } else {
          logger.error('Failed to read image data from:', screenshot.filename);
        }
      }).catch((error) => {
        logger.error('Failed to read image data from:', screenshot.filename, 'error: ', error);
      });
    } else {
      logger.error('Failed to read image data from:', screenshot.filename);
    }
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

  private _hasScreenshot = (): boolean => {
    return this.state.filename !== undefined && this.state.attachment !== undefined && this.state.attachmentUri !== undefined;
  }
}
