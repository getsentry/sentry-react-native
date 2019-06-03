import { BrowserOptions, Transports } from "@sentry/browser";
import { NoopTransport } from "@sentry/core";
import { BrowserBackend } from "@sentry/browser/dist/backend";
import { BaseBackend } from "@sentry/core";
import { Event, EventHint, Severity, Transport } from "@sentry/types";
import { SyncPromise } from "@sentry/utils";
import { NativeModules, YellowBox } from "react-native";

import { NativeTransport } from "./transports/native";

const { RNSentry } = NativeModules;

/**
 * Configuration options for the Sentry ReactNative SDK.
 * @see ReactNativeFrontend for more information.
 */
export interface ReactNativeOptions extends BrowserOptions {
  /**
   * Enables crash reporting for native crashes.
   * Defaults to `true`.
   */
  enableNative: boolean;
}

/** The Sentry ReactNative SDK Backend. */
export class ReactNativeBackend extends BaseBackend<BrowserOptions> {
  private readonly _browserBackend: BrowserBackend;

  /** Creates a new ReactNative backend instance. */
  public constructor(protected readonly _options: ReactNativeOptions) {
    super(_options);
    this._browserBackend = new BrowserBackend(_options);

    // This is a workaround for now using fetch on RN, this is a known issue in react-native and only generates a warning
    YellowBox.ignoreWarnings(["Require cycle:"]);

    if (
      RNSentry &&
      RNSentry.nativeClientAvailable &&
      _options.enableNative !== false
    ) {
      RNSentry.startWithDsnString(_options.dsn, _options).then(() => {
        RNSentry.setLogLevel(_options.debug ? 2 : 1);
      });
    }
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return new NoopTransport();
    }

    const transportOptions = this._options.transportOptions
      ? this._options.transportOptions
      : { dsn: this._options.dsn };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }

    if (this._isNativeTransportAvailable()) {
      return new NativeTransport();
    }

    return new Transports.FetchTransport(transportOptions);
  }

  /**
   * If true, native client is availabe and active
   */
  private _isNativeTransportAvailable(): boolean {
    return this._options.enableNative && RNSentry.nativeTransport;
  }

  /**
   * If native client is available it will trigger a native crash.
   * Use this only for testing purposes.
   */
  public nativeCrash(): void {
    if (this._isNativeTransportAvailable()) {
      RNSentry.crash();
    }
  }

  /**
   * @inheritDoc
   */
  public eventFromException(
    exception: any,
    hint?: EventHint
  ): SyncPromise<Event> {
    return this._browserBackend.eventFromException(exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: string,
    level: Severity = Severity.Info,
    hint?: EventHint
  ): SyncPromise<Event> {
    return this._browserBackend.eventFromMessage(message, level, hint);
  }
}

// --------------------------
// NativeClient.js
// --------------------------
// import {NativeModules, NativeEventEmitter} from 'react-native';
// const {RNSentry, RNSentryEventEmitter} = NativeModules;

// const DEFAULT_MODULE_IGNORES = [
//   'AccessibilityManager',
//   'ActionSheetManager',
//   'AlertManager',
//   'AppState',
//   'AsyncLocalStorage',
//   'Clipboard',
//   'DevLoadingView',
//   'DevMenu',
//   'ExceptionsManager',
//   'I18nManager',
//   'ImageEditingManager',
//   'ImageStoreManager',
//   'ImageViewManager',
//   'IOSConstants',
//   'JSCExecutor',
//   'JSCSamplingProfiler',
//   'KeyboardObserver',
//   'LinkingManager',
//   'LocationObserver',
//   'NativeAnimatedModule',
//   'NavigatorManager',
//   'NetInfo',
//   'Networking',
//   'RedBox',
//   'ScrollViewManager',
//   'SettingsManager',
//   'SourceCode',
//   'StatusBarManager',
//   'Timing',
//   'UIManager',
//   'Vibration',
//   'WebSocketModule',
//   'WebViewManager'
// ];

// export class NativeClient {
//   constructor(dsn, options) {
//     if (dsn.constructor !== String) {
//       throw new Error('Sentry: A DSN must be provided');
//     }
//     if (!RNSentry) {
//       throw new Error('Sentry: There is no native client installed.');
//     }

//     this._dsn = dsn;
//     this._activatedMerging = false;
//     this.options = {
//       ignoreModulesExclude: [],
//       ignoreModulesInclude: [],
//       deactivateStacktraceMerging: true
//     };
//     Object.assign(this.options, options);
//   }

//   _updateIgnoredModules(modules) {
//     const values = Object.values(modules);
//     const keys = Object.keys(modules);
//     for (let i = 0; i < values.length; i++) {
//       const moduleName = values[i].replace(/RCT/, '');
//       const moduleID = keys[i];
//       if (this._ignoredModules[moduleID]) {
//         continue;
//       }
//       this._addIgnoredModule(moduleID, moduleName);
//     }
//   }

//   _addIgnoredModule(moduleID, moduleName) {
//     if (
//       this.options.ignoreModulesExclude.indexOf(moduleName) === -1 &&
//       (DEFAULT_MODULE_IGNORES.indexOf(moduleName) >= 0 ||
//         this.options.ignoreModulesInclude.indexOf(moduleName) >= 0)
//     ) {
//       this._ignoredModules[moduleID] = true;
//     }
//   }

//   _activateStacktraceMerging = async () => {
//     return RNSentry.activateStacktraceMerging()
//       .then(activated => {
//         if (this._activatedMerging) {
//           return;
//         }
//         this._ignoredModules = {};
//         const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
//         if (typeof __fbBatchedBridgeConfig !== 'undefined') {
//           /* global __fbBatchedBridgeConfig */
//           __fbBatchedBridgeConfig.remoteModuleConfig.forEach((module, moduleID) => {
//             if (module !== null) {
//               this._addIgnoredModule(moduleID, module[0]);
//             }
//           });
//         } else if (BatchedBridge._remoteModuleTable) {
//           for (let moduleID in BatchedBridge._remoteModuleTable) {
//             if (BatchedBridge._remoteModuleTable.hasOwnProperty(moduleID)) {
//               let moduleName = BatchedBridge._remoteModuleTable[moduleID];
//               this._addIgnoredModule(moduleID, moduleName);
//             }
//           }
//         }
//         this._activatedMerging = true;
//         this._overwriteEnqueueNativeCall();
//       })
//       .catch(function(reason) {
//         // eslint-disable-next-line
//         console.log(reason);
//       });
//   };

//   _overwriteEnqueueNativeCall() {
//     const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
//     const original = BatchedBridge.enqueueNativeCall;
//     const that = this;
//     BatchedBridge.enqueueNativeCall = function(
//       moduleID: number,
//       methodID: number,
//       params: Array<any>,
//       onFail: ?Function,
//       onSucc: ?Function
//     ) {
//       if (that._ignoredModules[moduleID]) {
//         return original.apply(this, arguments);
//       }
//       params.push({
//         __sentry_stack: new Error().stack,
//         __sentry_moduleID: moduleID
//       });
//       return original.apply(this, arguments);
//     };
//   }
// }

// --------------------------
// raven-plugin.js
// --------------------------
// /*global ErrorUtils:false*/

// /**
//  * react-native plugin for Raven
//  *
//  * Usage:
//  *   var Raven = require('raven-js');
//  *   Raven.addPlugin(require('raven-js/plugins/react-native'));
//  *
//  * Options:
//  *
//  *   pathStrip: A RegExp that matches the portions of a file URI that should be
//  *     removed from stacks prior to submission.
//  *
//  *   onInitialize: A callback that fires once the plugin has fully initialized
//  *     and checked for any previously thrown fatals.  If there was a fatal, its
//  *     data payload will be passed as the first argument of the callback.
//  *
//  */
// 'use strict';
// import {NativeModules} from 'react-native';
// import {Sentry} from './Sentry';

// function wrappedCallback(callback) {
//   function dataCallback(data, original) {
//     var normalizedData = callback(data) || data;
//     if (original) {
//       return original(normalizedData) || normalizedData;
//     }
//     return normalizedData;
//   }
//   return dataCallback;
// }

// // Example React Native path format (iOS):
// // /var/containers/Bundle/Application/{DEVICE_ID}/HelloWorld.app/main.jsbundle

// /**
//  * Extract key/value pairs from an object and encode them for
//  * use in a query string
//  */
// function urlencode(obj) {
//   var pairs = [];
//   for (var key in obj) {
//     if ({}.hasOwnProperty.call(obj, key))
//       pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
//   }
//   return pairs.join('&');
// }

// /**
//  * Initializes React Native plugin
//  */
// function reactNativePlugin(Raven, options, internalDataCallback) {
//   options = options || {};

//   // Use data callback to strip device-specific paths from stack traces
//   Raven.setDataCallback(
//     wrappedCallback(function(data) {
//       data = reactNativePlugin._normalizeData(data, options.pathStrip);
//       if (internalDataCallback) {
//         internalDataCallback(data);
//       }
//     })
//   );

//   if (options.nativeClientAvailable === false) {
//     // react-native doesn't have a document, so can't use default Image
//     // transport - use XMLHttpRequest instead
//     Raven.setTransport(reactNativePlugin._transport);

//     // Check for a previously persisted payload, and report it.
//     reactNativePlugin._restorePayload().then(function(payload) {
//       options.onInitialize && options.onInitialize(payload);
//       if (!payload) return;
//       Raven._sendProcessedPayload(payload, function(error) {
//         if (error) return; // Try again next launch.
//         reactNativePlugin._clearPayload();
//       });
//     })['catch'](function() {});

//     Raven.setShouldSendCallback(function(data, originalCallback) {
//       if (!(FATAL_ERROR_KEY in data)) {
//         // not a fatal (will not crash runtime), continue as planned
//         return originalCallback ? originalCallback.call(this, data) : true;
//       }

//       var origError = data[FATAL_ERROR_KEY];
//       delete data[FATAL_ERROR_KEY];

//       reactNativePlugin._persistPayload(data).then(function() {
//         defaultHandler(origError, true);
//         handlingFatal = false; // In case it isn't configured to crash.
//         return null;
//       })['catch'](function() {});

//       return false; // Do not continue.
//     });
//   }

//   // Make sure that if multiple fatals occur, we only persist the first one.
//   //
//   // The first error is probably the most important/interesting error, and we
//   // want to crash ASAP, rather than potentially queueing up multiple errors.
//   var handlingFatal = false;

//   var defaultHandler =
//     (ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler()) ||
//     ErrorUtils._globalHandler;

//   if (options.handlePromiseRejection) {
//     // Track unhandled promise rejections
//     var tracking = require('promise/setimmediate/rejection-tracking');
//     tracking.disable();
//     tracking.enable({
//       allRejections: true,
//       onUnhandled: function(id, error) {
//         var captureOptions = {
//           timestamp: new Date() / 1000,
//           type: 'Unhandled Promise Rejection'
//         };
//         Raven.captureException(error, captureOptions);
//       },
//       onHandled: function() {}
//     });
//   }

// /**
//  * Custom HTTP transport for use with React Native applications.
//  */
// reactNativePlugin._transport = function(options) {
//   var request = new XMLHttpRequest();
//   request.onreadystatechange = function(e) {
//     if (request.readyState !== 4) {
//       return;
//     }

//     if (request.status === 200) {
//       if (options.onSuccess) {
//         options.onSuccess();
//       }
//     } else {
//       if (options.onError) {
//         var err = new Error('Sentry error code: ' + request.status);
//         err.request = request;
//         options.onError(err);
//       }
//     }
//   };

//   request.open('POST', options.url + '?' + urlencode(options.auth));

//   // NOTE: React Native ignores CORS and will NOT send a preflight
//   //       request for application/json.
//   // See: https://facebook.github.io/react-native/docs/network.html#xmlhttprequest
//   request.setRequestHeader('Content-type', 'application/json');

//   // Sentry expects an Origin header when using HTTP POST w/ public DSN.
//   // Just set a phony Origin value; only matters if Sentry Project is configured
//   // to whitelist specific origins.
//   request.setRequestHeader('Origin', 'react-native://');
//   request.send(JSON.stringify(options.data));
// };

// module.exports = reactNativePlugin;

// --------------------------
// RavenClient.js
// --------------------------
// import Raven from 'raven-js';
// import {Sentry, SentryLog} from './Sentry';

// export class RavenClient {
//   constructor(dsn, options) {
//     if (dsn.constructor !== String) {
//       throw new Error('SentryClient: A DSN must be provided');
//     }
//     this._dsn = dsn;
//     this.options = {
//       allowSecretKey: true,
//       allowDuplicates: Sentry.isNativeClientAvailable()
//     };
//     Object.assign(this.options, options);

//     Raven.config(dsn, this.options);
//     if (options.logLevel >= SentryLog.Debug) {
//       Raven.debug = true;
//     }
//   }

//   install() {
//     // we have to remove the sampleRate if native client is available
//     // otherwise we will sample twice
//     if (Sentry.isNativeClientAvailable() && this.options.sampleRate !== undefined) {
//       Raven._globalOptions.sampleRate = 1;
//     }

//     Raven.install();

//     Raven.addPlugin(
//       require('./raven-plugin'),
//       {
//         nativeClientAvailable: Sentry.isNativeClientAvailable(),
//         handlePromiseRejection: this.options.handlePromiseRejection
//       },
//       data => {
//         if (Sentry.options.internal) {
//           data.dist = Sentry.options.internal.dist;
//         }
//       }
//     );

//     if (Sentry.isNativeClientAvailable()) {
//       // We overwrite the default transport handler when the native
//       // client is available, because we want to send the event with native
//       Raven.setTransport(transportOptions => {
//         // We don't need to send breadcrumbs over the bridge
//         // since we capture all breacrumbs when they get created
//         delete transportOptions.data.breadcrumbs;
//         Sentry._captureEvent(transportOptions.data);
//       });
//       Raven.setBreadcrumbCallback(Sentry._breadcrumbCallback);
//       const oldCaptureBreadcrumb = Raven.captureBreadcrumb;
//       Raven.captureBreadcrumb = function(obj) {
//         if (obj.data && typeof obj.data === 'object') {
//           obj.data = Object.assign({}, obj.data);
//         }
//         return oldCaptureBreadcrumb.apply(this, arguments);
//       };
//     }
//   }

//   setDataCallback(callback) {
//     Raven.setDataCallback(callback);
//   }

//   setShouldSendCallback(callback) {
//     Raven.setShouldSendCallback(callback);
//   }

//   setUserContext(user) {
//     Raven.setUserContext(user);
//   }

//   setTagsContext(tags) {
//     Raven.setTagsContext(tags);
//   }

//   setExtraContext(extra) {
//     Raven.setExtraContext(extra);
//   }

//   captureException(ex, options) {
//     Raven.captureException(ex, options);
//   }

//   captureBreadcrumb(breadcrumb) {
//     Raven.captureBreadcrumb(breadcrumb);
//   }

//   captureMessage(message, options) {
//     Raven.captureMessage(message, options);
//   }

//   setRelease(release) {
//     Raven.setRelease(release);
//   }

//   clearContext() {
//     return Raven.clearContext();
//   }

//   context(options, func, args) {
//     return Raven.context(options, func, args);
//   }

//   wrap(options, func, _before) {
//     return Raven.wrap(options, func, _before);
//   }
// }

// --------------------------
// Sentry.js
// --------------------------
// import {NativeModules, NativeEventEmitter} from 'react-native';
// const {RNSentry, RNSentryEventEmitter} = NativeModules;

// import {RavenClient} from './RavenClient';
// import {NativeClient} from './NativeClient';

// export const SentrySeverity = {
//   Fatal: 'fatal',
//   Error: 'error',
//   Warning: 'warning',
//   Info: 'info',
//   Debug: 'debug',
//   Critical: 'critical'
// };

// export const SentryLog = {
//   None: 0,
//   Error: 1,
//   Debug: 2,
//   Verbose: 3
// };

// export const Sentry = {
//   async install() {
//     // We have to first setup raven otherwise react-native will freeze the options
//     // and some properties like ignoreErrors can not be mutated by raven-js
//     Sentry._ravenClient = new RavenClient(Sentry._dsn, Sentry.options);
//     if (
//       RNSentry &&
//       RNSentry.nativeClientAvailable &&
//       Sentry.options.disableNativeIntegration === false
//     ) {
//       Sentry._nativeClient = new NativeClient(Sentry._dsn, Sentry.options);
//       Sentry.eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
//       Sentry.eventEmitter.addListener(
//         RNSentryEventEmitter.EVENT_SENT_SUCCESSFULLY,
//         event => {
//           Sentry._lastEvent = event;
//           if (Sentry._eventSentSuccessfully) Sentry._eventSentSuccessfully(event);
//         }
//       );
//       Sentry.eventEmitter.addListener(RNSentryEventEmitter.EVENT_STORED, () => {
//         if (Sentry._internalEventStored) Sentry._internalEventStored();
//       });
//     }
//     if (Sentry._nativeClient) {
//       return Sentry._nativeClient.install().then(() => {
//         Sentry._ravenClient.install();
//       });
//     } else {
//       // We need to call install here since this add the callback for sending events
//       // over the native bridge
//       return Sentry._ravenClient.install();
//     }
//   },

//   config(dsn, options) {
//     if (typeof dsn !== 'string') {
//       throw new Error('Sentry: A DSN must be provided');
//     }
//     Sentry._dsn = dsn;
//     Sentry.options = {
//       logLevel: SentryLog.None,
//       instrument: false,
//       disableNativeIntegration: false,
//       handlePromiseRejection: true
//     };
//     Object.assign(Sentry.options, options);
//     return Sentry;
//   },

//   isNativeClientAvailable() {
//     return (
//       Sentry._nativeClient !== undefined &&
//       Sentry.options.disableNativeIntegration === false
//     );
//   },

//   _log(...args) {
//     if (Sentry.options && Sentry.options.logLevel >= 2) {
//       // eslint-disable-next-line
//       console.log.apply(null, args);
//     }
//   },

//   crash() {
//     throw new Error('Sentry: TEST crash');
//   },

//   nativeCrash() {
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.nativeCrash();
//   },

//   setEventSentSuccessfully(callback) {
//     Sentry._eventSentSuccessfully = callback;
//   },

//   setShouldSendCallback(callback) {
//     Sentry._log('react-native-sentry (setShouldSendCallback):', callback);
//     if (Sentry._ravenClient) Sentry._ravenClient.setShouldSendCallback(callback);
//   },

//   setDataCallback(callback) {
//     Sentry._log('react-native-sentry (setDataCallback):', callback);
//     if (Sentry._ravenClient) Sentry._ravenClient.setDataCallback(callback);
//   },

//   setUserContext(user) {
//     Sentry._log('react-native-sentry (setUserContext):', user);
//     if (Sentry._ravenClient) Sentry._ravenClient.setUserContext(user);
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setUserContext(user);
//   },

//   setTagsContext(tags) {
//     Sentry._log('react-native-sentry (setTagsContext):', tags);
//     if (Sentry._ravenClient) Sentry._ravenClient.setTagsContext(tags);
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setTagsContext(tags);
//   },

//   setExtraContext(extra) {
//     Sentry._log('react-native-sentry (setExtraContext):', extra);
//     if (Sentry._ravenClient) Sentry._ravenClient.setExtraContext(extra);
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setExtraContext(extra);
//   },

//   captureMessage(message, options) {
//     Sentry._log('react-native-sentry (captureMessage):', message, options);
//     if (Sentry._ravenClient) Sentry._ravenClient.captureMessage(message, options);
//   },

//   captureException(ex, options) {
//     Sentry._log('react-native-sentry (captureException):', ex, options);
//     if (Sentry._ravenClient) Sentry._ravenClient.captureException(ex, options);
//   },

//   captureBreadcrumb(breadcrumb) {
//     Sentry._log('react-native-sentry (captureBreadcrumb):', breadcrumb);
//     if (Sentry._ravenClient) Sentry._ravenClient.captureBreadcrumb(breadcrumb);
//   },

//   async clearContext() {
//     Sentry._log('react-native-sentry (clearContext)');
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.clearContext();
//     if (Sentry._ravenClient) Sentry._ravenClient.clearContext();
//   },

//   async crashedLastLaunch() {
//     return await RNSentry.crashedLastLaunch();
//   },

//   context(options, func, args) {
//     Sentry._log('react-native-sentry (context)');
//     if (Sentry._ravenClient) return Sentry._ravenClient.context(options, func, args);
//     return this;
//   },

//   wrap(options, func, _before) {
//     Sentry._log('react-native-sentry (wrap)');
//     if (Sentry._ravenClient) return Sentry._ravenClient.wrap(options, func, _before);
//     return this;
//   },

//   lastException() {
//     if (Sentry._lastEvent) return Sentry._lastEvent;
//     return null;
//   },

//   lastEventId() {
//     if (Sentry._lastEvent) return Sentry._lastEvent.event_id;
//     return null;
//   },

//   setRelease(release) {
//     Sentry._log('react-native-sentry (setRelease)');
//     Sentry._setInternalOption('release', release);
//     if (Sentry._ravenClient) Sentry._ravenClient.setRelease(release);
//   },

//   setDist(dist) {
//     Sentry._setInternalOption('dist', dist);
//   },

//   setVersion(version) {
//     Sentry._setInternalOption('version', version);
//   },

//   // Private helpers

//   _setInternalOption(key, value) {
//     if (Sentry.isNativeClientAvailable()) {
//       Sentry._nativeClient.addExtraContext('__sentry_' + key, value);
//     }
//     if (undefined === Sentry.options.internal) {
//       Sentry.options.internal = {};
//     }
//     Sentry.options.internal[key] = value;
//   },

//   _getInternalOption(key) {
//     return Sentry.options.internal[key];
//   },

//   _breadcrumbCallback(crumb) {
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureBreadcrumb(crumb);
//   },

//   _captureEvent(event) {
//     if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureEvent(event);
//   },

//   _setInternalEventStored(callback) {
//     Sentry._internalEventStored = callback;
//   }
// };

// export default Sentry;
