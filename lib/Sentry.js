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

export const Sentry = {
  async install() {
    // We have to first setup raven otherwise react-native will freeze the options
    // and some properties like ignoreErrors can not be mutated by raven-js
    Sentry._ravenClient = new RavenClient(Sentry._dsn, Sentry.options);
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
      Sentry.eventEmitter.addListener(RNSentryEventEmitter.EVENT_STORED, () => {
        if (Sentry._internalEventStored) Sentry._internalEventStored();
      });
    }
    if (Sentry._nativeClient) {
      return Sentry._nativeClient.install().then(() => {
        Sentry._ravenClient.install();
      });
    } else {
      // We need to call install here since this add the callback for sending events
      // over the native bridge
      return Sentry._ravenClient.install();
    }
  },

  config(dsn, options) {
    if (typeof dsn !== 'string') {
      throw new Error('Sentry: A DSN must be provided');
    }
    Sentry._dsn = dsn;
    Sentry.options = {
      logLevel: SentryLog.None,
      instrument: false,
      disableNativeIntegration: false,
      handlePromiseRejection: true
    };
    Object.assign(Sentry.options, options);
    return Sentry;
  },

  isNativeClientAvailable() {
    return (
      Sentry._nativeClient !== undefined &&
      Sentry.options.disableNativeIntegration === false
    );
  },

  _log(...args) {
    if (Sentry.options && Sentry.options.logLevel >= 2) {
      // eslint-disable-next-line
      console.log.apply(null, args);
    }
  },

  crash() {
    throw new Error('Sentry: TEST crash');
  },

  nativeCrash() {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.nativeCrash();
  },

  setEventSentSuccessfully(callback) {
    Sentry._eventSentSuccessfully = callback;
  },

  setShouldSendCallback(callback) {
    Sentry._log('react-native-sentry (setShouldSendCallback):', callback);
    if (Sentry._ravenClient) Sentry._ravenClient.setShouldSendCallback(callback);
  },

  setDataCallback(callback) {
    Sentry._log('react-native-sentry (setDataCallback):', callback);
    if (Sentry._ravenClient) Sentry._ravenClient.setDataCallback(callback);
  },

  setUserContext(user) {
    Sentry._log('react-native-sentry (setUserContext):', user);
    if (Sentry._ravenClient) Sentry._ravenClient.setUserContext(user);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setUserContext(user);
  },

  setTagsContext(tags) {
    Sentry._log('react-native-sentry (setTagsContext):', tags);
    if (Sentry._ravenClient) Sentry._ravenClient.setTagsContext(tags);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setTagsContext(tags);
  },

  setExtraContext(extra) {
    Sentry._log('react-native-sentry (setExtraContext):', extra);
    if (Sentry._ravenClient) Sentry._ravenClient.setExtraContext(extra);
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setExtraContext(extra);
  },

  captureMessage(message, options) {
    Sentry._log('react-native-sentry (captureMessage):', message, options);
    if (Sentry._ravenClient) Sentry._ravenClient.captureMessage(message, options);
  },

  captureException(ex, options) {
    Sentry._log('react-native-sentry (captureException):', ex, options);
    if (Sentry._ravenClient) Sentry._ravenClient.captureException(ex, options);
  },

  captureBreadcrumb(breadcrumb) {
    Sentry._log('react-native-sentry (captureBreadcrumb):', breadcrumb);
    if (Sentry._ravenClient) Sentry._ravenClient.captureBreadcrumb(breadcrumb);
  },

  async clearContext() {
    Sentry._log('react-native-sentry (clearContext)');
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.clearContext();
    if (Sentry._ravenClient) Sentry._ravenClient.clearContext();
  },

  async crashedLastLaunch() {
    return await RNSentry.crashedLastLaunch();
  },

  context(options, func, args) {
    Sentry._log('react-native-sentry (context)');
    if (Sentry._ravenClient) return Sentry._ravenClient.context(options, func, args);
    return this;
  },

  wrap(options, func, _before) {
    Sentry._log('react-native-sentry (wrap)');
    if (Sentry._ravenClient) return Sentry._ravenClient.wrap(options, func, _before);
    return this;
  },

  lastException() {
    if (Sentry._lastEvent) return Sentry._lastEvent;
    return null;
  },

  lastEventId() {
    if (Sentry._lastEvent) return Sentry._lastEvent.event_id;
    return null;
  },

  setRelease(release) {
    Sentry._log('react-native-sentry (setRelease)');
    Sentry._setInternalOption('release', release);
    if (Sentry._ravenClient) Sentry._ravenClient.setRelease(release);
  },

  setDist(dist) {
    Sentry._setInternalOption('dist', dist);
  },

  setVersion(version) {
    Sentry._setInternalOption('version', version);
  },

  // Private helpers

  _setInternalOption(key, value) {
    if (Sentry.isNativeClientAvailable()) {
      Sentry._nativeClient.addExtraContext('__sentry_' + key, value);
    }
    if (undefined === Sentry.options.internal) {
      Sentry.options.internal = {};
    }
    Sentry.options.internal[key] = value;
  },

  _getInternalOption(key) {
    return Sentry.options.internal[key];
  },

  _breadcrumbCallback(crumb) {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureBreadcrumb(crumb);
  },

  _captureEvent(event) {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureEvent(event);
  },

  _setInternalEventStored(callback) {
    Sentry._internalEventStored = callback;
  }
};

export default Sentry;
