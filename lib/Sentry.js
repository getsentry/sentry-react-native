import {NativeModules, NativeEventEmitter} from 'react-native';
const {RNSentry, RNSentryEventEmitter} = NativeModules;

import {RavenClient} from './RavenClient';
import {NativeClient} from './NativeClient';

export const SentrySeverity = {
  Fatal: 'fatal',
  Error: 'error',
  Warning: 'warning',
  Info: 'info',
  Debug: 'debug',
  Critical: 'critical'
};

export const SentryLog = {
  None: 0,
  Error: 1,
  Debug: 2,
  Verbose: 3
};

export class Sentry {
  static install() {
    if (
      RNSentry &&
      RNSentry.nativeClientAvailable &&
      Sentry.options.disableNativeIntegration === false
    ) {
      Sentry._nativeClient = new NativeClient(Sentry._dsn, Sentry.options);
      Sentry.eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
      Sentry.eventEmitter.addListener(
        RNSentryEventEmitter.EVENT_SENT_SUCCESSFULLY,
        event => {
          Sentry._lastEvent = event;
          if (Sentry._eventSentSuccessfully) Sentry._eventSentSuccessfully(event);
        }
      );
    }
    Sentry._ravenClient = new RavenClient(Sentry._dsn, Sentry.options);
  }

  static config(dsn, options) {
    if (dsn.constructor !== String) {
      throw new Error('Sentry: A DSN must be provided');
    }
    Sentry._dsn = dsn;
    Sentry.options = {
      logLevel: SentryLog.None,
      instrument: false,
      disableNativeIntegration: false
    };
    Object.assign(Sentry.options, options);
    return Sentry;
  }

  static isNativeClientAvailable() {
    return Sentry._nativeClient !== undefined;
  }

  static _log(...args) {
    if (Sentry.options.logLevel >= 2) {
      // eslint-disable-next-line
      console.log.apply(null, args);
    }
  }

  static crash() {
    throw new Error('Sentry: TEST crash');
  }

  static nativeCrash() {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.nativeCrash();
  }

  static setEventSentSuccessfully(callback) {
    Sentry._eventSentSuccessfully = callback;
  }

  static setDataCallback(callback) {
    Sentry._log('react-native-sentry (setDataCallback):', callback);
    if (Sentry._ravenClient) Sentry._ravenClient.setDataCallback(callback);
  }

  static setUserContext(user) {
    Sentry._log('react-native-sentry (setUserContext):', user);
    if (Sentry._ravenClient) Sentry._ravenClient.setUserContext(user);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setUserContext(user);
  }

  static setTagsContext(tags) {
    Sentry._log('react-native-sentry (setTagsContext):', tags);
    if (Sentry._ravenClient) Sentry._ravenClient.setTagsContext(tags);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setTagsContext(tags);
  }

  static setExtraContext(extra) {
    Sentry._log('react-native-sentry (setExtraContext):', extra);
    if (Sentry._ravenClient) Sentry._ravenClient.setExtraContext(extra);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setExtraContext(extra);
  }

  static captureMessage(message, options) {
    Sentry._log('react-native-sentry (captureMessage):', message, options);
    if (Sentry._ravenClient) Sentry._ravenClient.captureMessage(message, options);
  }

  static captureException(ex, options) {
    Sentry._log('react-native-sentry (captureMessage):', ex, options);
    if (Sentry._ravenClient) Sentry._ravenClient.captureException(ex, options);
  }

  static captureBreadcrumb(msg, options) {
    Sentry._log('react-native-sentry (captureMessage):', msg, options);
    if (Sentry._ravenClient) Sentry._ravenClient.captureBreadcrumb(msg, options);
  }

  static clearContext = async () => {
    Sentry._log('react-native-sentry (clearContext)');
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.clearContext();
    if (Sentry._ravenClient) Sentry._ravenClient.clearContext();
  };

  static context(options, func, args) {
    Sentry._log('react-native-sentry (context)');
    if (Sentry._ravenClient) return Sentry._ravenClient.context(options, func, args);
    return this;
  }

  static wrap(options, func, _before) {
    Sentry._log('react-native-sentry (wrap)');
    if (Sentry._ravenClient) return Sentry._ravenClient.wrap(options, func, _before);
    return this;
  }

  static lastException() {
    if (Sentry._lastEvent) return Sentry._lastEvent;
    return null;
  }

  static lastEventId() {
    if (Sentry._lastEvent) return Sentry._lastEvent.event_id;
    return null;
  }

  static setRelease(release) {
    Sentry._log('react-native-sentry (setRelease)');
    Sentry._setInternalOption('release', release);
    if (Sentry._ravenClient) Sentry._ravenClient.setRelease(release);
  }

  static setDist(dist) {
    Sentry._setInternalOption('dist', dist);
  }

  static setVersion(version) {
    Sentry._setInternalOption('version', version);
  }

  // Private helpers

  static _setInternalOption(key, value) {
    if (Sentry.isNativeClientAvailable()) {
      Sentry._nativeClient.addExtraContext('__sentry_' + key, value);
    }
    if (undefined === Sentry.options.internal) {
      Sentry.options.internal = {};
    }
    Sentry.options.internal[key] = value;
  }

  static _getInternalOption(key) {
    return Sentry.options.internal[key];
  }

  static _breadcrumbCallback(crumb) {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureBreadcrumb(crumb);
  }

  static _captureEvent(event) {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureEvent(event);
  }
}
