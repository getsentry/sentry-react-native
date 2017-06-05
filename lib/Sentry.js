import {
  NativeModules,
  NativeEventEmitter
} from 'react-native';
import Raven from 'raven-js';

const {
  RNSentry,
  RNSentryEventEmitter
} = NativeModules;

const DEFAULT_MODULE_IGNORES = [
  "AccessibilityManager",
  "ActionSheetManager",
  "AlertManager",
  "AppState",
  "AsyncLocalStorage",
  "Clipboard",
  "DevLoadingView",
  "DevMenu",
  "ExceptionsManager",
  "I18nManager",
  "ImageEditingManager",
  "ImageStoreManager",
  "ImageViewManager",
  "IOSConstants",
  "JSCExecutor",
  "JSCSamplingProfiler",
  "KeyboardObserver",
  "LinkingManager",
  "LocationObserver",
  "NativeAnimatedModule",
  "NavigatorManager",
  "NetInfo",
  "Networking",
  "RedBox",
  "ScrollViewManager",
  "SettingsManager",
  "SourceCode",
  "StatusBarManager",
  "Timing",
  "UIManager",
  "Vibration",
  "WebSocketModule",
  "WebViewManager"
];

export const SentrySeverity = {
  Fatal: "fatal",
  Error: "error",
  Warning: "warning",
  Info: "info",
  Debug: "debug",
  Critical: "critical",
}

export const SentryLog = {
  None: 0,
  Error: 1,
  Debug: 2,
  Verbose: 3
}

export class Sentry {
  static install() {
    if (RNSentry && RNSentry.nativeClientAvailable) {
      Sentry._nativeClient = new NativeClient(Sentry._dsn, Sentry.options);
      Sentry.eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
      Sentry.eventEmitter.addListener(RNSentryEventEmitter.EVENT_SENT_SUCCESSFULLY, (event) => {
        Sentry._lastEvent = event;
        if (Sentry._eventSentSuccessfully) Sentry._eventSentSuccessfully(event);
      });
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
      instrument: false
    }
    Object.assign(Sentry.options, options);
    return Sentry;
  }

  static isNativeClientAvailable() {
    return (Sentry._nativeClient);
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
    if (Sentry._ravenClient) {
      Sentry._ravenClient.setDataCallback(callback);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (setDataCallback):', callback);
      }
    }
  }

  static setUserContext(user) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.setUserContext(user);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (setUserContext):', user);
      }
    }
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setUserContext(user);
  }

  static setTagsContext(tags) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.setTagsContext(tags);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (setTagsContext):', tags);
      }
    }
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setTagsContext(tags);
  }

  static setExtraContext(extra) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.setExtraContext(extra);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (setExtraContext):', extra);
      }
    }
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setExtraContext(extra);
  }

  static captureMessage(message, options) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.captureMessage(message, options);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (captureMessage):', message, options);
      }
    }
  }

  static captureException(ex, options) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.captureException(ex, options);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (captureException):', ex, options);
      }
    }
  }

  static captureBreadcrumb(msg, options) {
    if (Sentry._ravenClient) {
      Sentry._ravenClient.captureBreadcrumb(msg, options);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (captureBreadcrumb):', msg, options);
      }
    }
  }

  static clearContext(clearContext) {
    if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.clearContext();
    if (Sentry._ravenClient) {
      Sentry._ravenClient.clearContext(clearContext);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (clearContext):', clearContext);
      }
    }
  }

  static context(options, func, args) {
    if (Sentry._ravenClient) {
      return Sentry._ravenClient.context(options, func, args);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (context)');
      }
      return null
    }
  }

  static wrap(options, func, _before) {
    if (Sentry._ravenClient) {
      return Sentry._ravenClient.wrap(options, func, _before);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (wrap)');
      }
      return null
    }
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
    Sentry._setInternalOption('release', release);
    if (Sentry._ravenClient) {
      Sentry._ravenClient.setRelease(release);
    } else {
      if (Sentry.options.logLevel >= 2) {
        console.log('react-native-sentry (setRelease):', release);
      }
    }
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

class NativeClient {
  constructor(dsn, options) {
    if (dsn.constructor !== String) {
      throw new Error('Sentry: A DSN must be provided');
    }
    if (!RNSentry) {
      throw new Error('Sentry: There is no native client installed.');
    }

    this._dsn = dsn;
    this._activatedMerging = false;
    this.options = {
      ignoreModulesExclude: [],
      ignoreModulesInclude: [],
      deactivateStacktraceMerging: false
    }
    Object.assign(this.options, options);

    RNSentry.startWithDsnString(this._dsn);
    if (this.options.deactivateStacktraceMerging === false) {
      this._activateStacktraceMerging();
    }
    RNSentry.setLogLevel(options.logLevel);
  }

  nativeCrash() {
    RNSentry.crash();
  }

  captureEvent(event) {
    RNSentry.captureEvent(event);
  }

  setUserContext(user) {
    RNSentry.setUser(user);
  }

  setTagsContext(tags) {
    RNSentry.setTags(tags);
  }

  setExtraContext(extra) {
    RNSentry.setExtra(extra);
  }

  addExtraContext(key, value) {
    RNSentry.addExtra(key, value);
  }

  captureBreadcrumb(crumb) {
    RNSentry.captureBreadcrumb(crumb);
  }

  clearContext() {
    RNSentry.clearContext();
  }

  _activateStacktraceMerging = async() => {
    return RNSentry.activateStacktraceMerging().then(activated => {
      if (this._activatedMerging) {
        return;
      }
      this._ignoredModules = {};
      __fbBatchedBridgeConfig.remoteModuleConfig.forEach((module, moduleID) => {
        if (module !== null &&
          this.options.ignoreModulesExclude.indexOf(module[0]) === -1 &&
          (DEFAULT_MODULE_IGNORES.indexOf(module[0]) >= 0 ||
            this.options.ignoreModulesInclude.indexOf(module[0]) >= 0)) {
          this._ignoredModules[moduleID] = true;
        }
      });
      this._activatedMerging = true;
      this._overwriteEnqueueNativeCall();
    });
  }

  _overwriteEnqueueNativeCall() {
    const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
    const original = BatchedBridge.enqueueNativeCall;
    const that = this;
    BatchedBridge.enqueueNativeCall = function(moduleID: number, methodID: number, params: Array < any > , onFail: ? Function, onSucc : ? Function) {
      if (that._ignoredModules[moduleID]) {
        return original.apply(this, arguments);
      }
      params.push({
        '__sentry_stack': new Error().stack
      });
      return original.apply(this, arguments);
    }
  }
}

class RavenClient {
  constructor(dsn, options) {
    if (dsn.constructor !== String) {
      throw new Error('SentryClient: A DSN must be provided');
    }
    this._dsn = dsn;
    this.options = {
      allowSecretKey: true,
      allowDuplicates: Sentry.isNativeClientAvailable()
    }
    Object.assign(this.options, options);
    Raven.addPlugin(require('./raven-plugin'), {
      'nativeClientAvailable': Sentry.isNativeClientAvailable()
    }, (data) => {
      if (Sentry.options.internal) {
        data.dist = Sentry.options.internal['dist'];
      }
    });

    Raven.config(dsn, this.options).install();
    if (options.logLevel >= SentryLog.Debug) {
      Raven.debug = true;
    }
    if (Sentry.isNativeClientAvailable()) {
      // We overwrite the default transport handler when the native
      // client is available, because we want to send the event with native
      Raven.setTransport((options) => {
        Sentry._captureEvent(options.data);
      });
      Raven.setBreadcrumbCallback(Sentry._breadcrumbCallback);
      const oldCaptureBreadcrumb = Raven.captureBreadcrumb;
      Raven.captureBreadcrumb = function(obj) {
        if (obj.data && typeof obj.data === 'object') {
          obj.data = Object.assign({}, obj.data);
        }
        return oldCaptureBreadcrumb.apply(this, arguments);
      }
    }
  }

  setDataCallback(callback) {
    Raven.setDataCallback(callback);
  }

  setUserContext(user) {
    Raven.setUserContext(user);
  }

  setTagsContext(tags) {
    Raven.setTagsContext(tags);
  }

  setExtraContext(extra) {
    Raven.setExtraContext(extra)
  }

  captureException(ex, options) {
    Raven.captureException(ex, options);
  }

  captureBreadcrumb(msg, options) {
    Raven.captureBreadcrumb(msg, options);
  }

  captureMessage(message, options) {
    Raven.captureMessage(message, options);
  }

  setRelease(release) {
    Raven.setRelease(release);
  }

  context(options, func, args) {
    return Raven.context(options, func, args);
  }

  wrap(options, func, _before) {
    return Raven.wrap(options, func, _before);
  }
}
