import { BrowserOptions } from '@sentry/browser';
import { BrowserBackend } from '@sentry/browser/dist/backend';
import { BaseBackend } from '@sentry/core';
import { Breadcrumb, Event, EventHint, Scope, Severity } from '@sentry/types';
import { forget, getGlobalObject, logger, SyncPromise } from '@sentry/utils';
import {NativeModules, NativeEventEmitter} from 'react-native';

const {RNSentry, RNSentryEventEmitter} = NativeModules;

const PLUGIN_NAME = 'Sentry';

/**
 * Configuration options for the Sentry ReactNative SDK.
 * @see ReactNativeFrontend for more information.
 */
export interface ReactNativeOptions extends BrowserOptions {
  /**
   * Enables crash reporting for native crashes.
   * Defaults to `true`.
   */
  enableNative?: boolean;
}

/** The Sentry ReactNative SDK Backend. */
export class ReactNativeBackend extends BaseBackend<BrowserOptions> {
  private readonly _browserBackend: BrowserBackend;
  private readonly _eventEmitter?: NativeEventEmitter;

  /** Creates a new ReactNative backend instance. */
  public constructor(protected readonly _options: ReactNativeOptions = {}) {
    super(_options);
    this._browserBackend = new BrowserBackend(_options);

    if (RNSentry &&
      RNSentry.nativeClientAvailable &&_options.enableNative !== false) {

      // Sentry._nativeClient = new NativeClient(Sentry._dsn, Sentry.options);
      this._eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
      this._eventEmitter.addListener(
        RNSentryEventEmitter.EVENT_SENT_SUCCESSFULLY,
        _event => {
          // Sentry._lastEvent = event;
          // if (Sentry._eventSentSuccessfully) Sentry._eventSentSuccessfully(event);
        }
      );
      // Sentry.eventEmitter.addListener(RNSentryEventEmitter.EVENT_STORED, () => {
      //   if (Sentry._internalEventStored) Sentry._internalEventStored();
      // });

    }
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: any, hint?: EventHint): SyncPromise<Event> {
    return this._browserBackend.eventFromException(exception, hint);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(message: string, level: Severity = Severity.Info, hint?: EventHint): SyncPromise<Event> {
    return this._browserBackend.eventFromMessage(message, level, hint);
  }

  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): void {
    this._nativeCall('sendEvent', event).catch(e => {
      logger.warn(e);
      this._browserBackend.sendEvent(event);
    });
  }

  // ReactNative --------------------
  /**
   * Uses exec to call ReactNative functions
   * @param action name of the action
   * @param args Arguments
   */
  private async _nativeCall(action: string, ...args: any[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this._options.enableNative === false) {
        reject('enableNative = false, using browser transport');
        return;
      }

      const _window = getGlobalObject<any>();
      // tslint:disable-next-line: no-unsafe-any
      const exec = _window && _window.ReactNative && _window.ReactNative.exec;
      if (!exec) {
        reject('ReactNative.exec not available');
      } else {
        try {
          // tslint:disable-next-line: no-unsafe-any
          _window.ReactNative.exec(resolve, reject, PLUGIN_NAME, action, args);
        } catch (e) {
          reject('ReactNative.exec not available');
        }
      }
    });
  }

  /**
   * @inheritDoc
   */
  public storeBreadcrumb(breadcrumb: Breadcrumb): boolean {
    forget(this._nativeCall('addBreadcrumb', breadcrumb));
    return true;
  }

  /**
   * @inheritDoc
   */
  public storeScope(scope: Scope): void {
    forget(this._nativeCall('setExtraContext', (scope as any).extra));
    forget(this._nativeCall('setTagsContext', (scope as any).tags));
    forget(this._nativeCall('setUserContext', (scope as any).user));
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

//   async install() {
//     return RNSentry.startWithDsnString(this._dsn, this.options).then(() => {
//       if (this.options.deactivateStacktraceMerging === false) {
//         this._activateStacktraceMerging();
//         const eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
//         eventEmitter.addListener(RNSentryEventEmitter.MODULE_TABLE, moduleTable => {
//           try {
//             this._updateIgnoredModules(JSON.parse(moduleTable.payload));
//           } catch (e) {
//             // https://github.com/getsentry/react-native-sentry/issues/241
//             // under some circumstances the the JSON is not valid
//             // the reason for this is yet to be found
//           }
//         });
//       }
//       RNSentry.setLogLevel(this.options.logLevel);
//     });
//   }

//   _cloneObject(obj) {
//     return JSON.parse(JSON.stringify(obj));
//   }

//   nativeCrash() {
//     RNSentry.crash();
//   }

//   captureEvent(event) {
//     RNSentry.captureEvent(this._cloneObject(event));
//   }

//   setUserContext(user) {
//     RNSentry.setUser(this._cloneObject(user));
//   }

//   setTagsContext(tags) {
//     RNSentry.setTags(this._cloneObject(tags));
//   }

//   setExtraContext(extra) {
//     RNSentry.setExtra(this._cloneObject(extra));
//   }

//   addExtraContext(key, value) {
//     RNSentry.addExtra(key, value);
//   }

//   captureBreadcrumb(breadcrumb) {
//     RNSentry.captureBreadcrumb(this._cloneObject(breadcrumb));
//   }

//   clearContext() {
//     RNSentry.clearContext();
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

// var PATH_STRIP_RE = /^.*\/[^\.]+(\.app|CodePush|.*(?=\/))/;
// var FATAL_ERROR_KEY = '--rn-fatal--';
// var ASYNC_STORAGE_KEY = '--raven-js-global-error-payload--';

// /**
//  * Strip device-specific IDs from React Native file:// paths
//  * Ensure path begins with / (after app://) to ensure source code and map path can be found
//  */
// function normalizeUrl(url, pathStripRe) {
//   const normUrl = url.replace(/^file\:\/\//, '').replace(pathStripRe, '');
//   if (normUrl.indexOf('/') !== 0) {
//     return 'app:///' + normUrl;
//   }
//   return 'app://' + normUrl;
// }

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

//   ErrorUtils.setGlobalHandler(function(error, isFatal) {
//     var captureOptions = {
//       timestamp: new Date() / 1000
//     };
//     var error = arguments[0];
//     if (isFatal) {
//       captureOptions.level = 'fatal';
//     }
//     // We want to handle fatals, but only in production mode.
//     var shouldHandleFatal = isFatal && !global.__DEV__;
//     if (shouldHandleFatal) {
//       if (handlingFatal) {
//         console.log('Encountered multiple fatals in a row. The latest:', error);
//         return;
//       }
//       handlingFatal = true;
//       // We need to preserve the original error so that it can be rethrown
//       // after it is persisted (see our shouldSendCallback above).
//       captureOptions[FATAL_ERROR_KEY] = error;
//     }
//     Raven.captureException(error, captureOptions);
//     if (options.nativeClientAvailable) {
//       // We always want to tunnel errors to the default handler
//       Sentry._setInternalEventStored(() => {
//         defaultHandler(error, isFatal);
//       });
//     } else {
//       // if we don't have a native
//       defaultHandler(error, isFatal);
//     }
//   });
// }

// /**
//  * Saves the payload for a globally-thrown error, so that we can report it on
//  * next launch.
//  *
//  * Returns a promise that guarantees never to reject.
//  */
// reactNativePlugin._persistPayload = function(payload) {
//   var AsyncStorage = require('react-native').AsyncStorage;
//   return AsyncStorage.setItem(ASYNC_STORAGE_KEY, JSON.stringify(payload))[
//     'catch'
//   ](function() {
//     return null;
//   });
// };

// /**
//  * Checks for any previously persisted errors (e.g. from last crash)
//  *
//  * Returns a promise that guarantees never to reject.
//  */
// reactNativePlugin._restorePayload = function() {
//   var AsyncStorage = require('react-native').AsyncStorage;
//   var promise = AsyncStorage.getItem(ASYNC_STORAGE_KEY).then(function(payload) {
//     return JSON.parse(payload);
//   })['catch'](function() {
//     return null;
//   });
//   // Make sure that we fetch ASAP.
//   var RCTAsyncSQLiteStorage = NativeModules.AsyncSQLiteDBStorage;
//   var RCTAsyncRocksDBStorage = NativeModules.AsyncRocksDBStorage;
//   var RCTAsyncFileStorage = NativeModules.AsyncLocalStorage;
//   var RCTAsyncStorage =
//     RCTAsyncRocksDBStorage || RCTAsyncSQLiteStorage || RCTAsyncFileStorage;
//   if (RCTAsyncStorage.multiGet) {
//     AsyncStorage.flushGetRequests();
//   }

//   return promise;
// };

// /**
//  * Clears any persisted payloads.
//  */
// reactNativePlugin._clearPayload = function() {
//   var AsyncStorage = require('react-native').AsyncStorage;
//   return AsyncStorage.removeItem(ASYNC_STORAGE_KEY)['catch'](function() {
//     return null;
//   });
// };

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

// /**
//  * Strip device-specific IDs found in transaction and frame filenames
//  * when running React Native applications on a physical device.
//  */
// reactNativePlugin._normalizeData = function(data, pathStripRe) {
//   if (!pathStripRe) {
//     pathStripRe = PATH_STRIP_RE;
//   }

//   if (data.culprit) {
//     data.culprit = normalizeUrl(data.culprit, pathStripRe);
//   }

//   if (data.transaction) {
//     data.transaction = normalizeUrl(data.transaction, pathStripRe);
//   }

//   // NOTE: if data.exception exists, exception.values and exception.values[0] are
//   // guaranteed to exist
//   var stacktrace =
//     data.stacktrace || (data.exception && data.exception.values[0].stacktrace);
//   if (stacktrace) {
//     stacktrace.frames.forEach(function(frame) {
//       if (frame.filename !== '[native code]') {
//         frame.filename = normalizeUrl(frame.filename, pathStripRe);
//       }
//     });
//   }
//   return data;
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
