import {NativeModules, NativeEventEmitter} from 'react-native';
const {RNSentry, RNSentryEventEmitter} = NativeModules;

const DEFAULT_MODULE_IGNORES = [
  'AccessibilityManager',
  'ActionSheetManager',
  'AlertManager',
  'AppState',
  'AsyncLocalStorage',
  'Clipboard',
  'DevLoadingView',
  'DevMenu',
  'ExceptionsManager',
  'I18nManager',
  'ImageEditingManager',
  'ImageStoreManager',
  'ImageViewManager',
  'IOSConstants',
  'JSCExecutor',
  'JSCSamplingProfiler',
  'KeyboardObserver',
  'LinkingManager',
  'LocationObserver',
  'NativeAnimatedModule',
  'NavigatorManager',
  'NetInfo',
  'Networking',
  'RedBox',
  'ScrollViewManager',
  'SettingsManager',
  'SourceCode',
  'StatusBarManager',
  'Timing',
  'UIManager',
  'Vibration',
  'WebSocketModule',
  'WebViewManager'
];

export class NativeClient {
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
      deactivateStacktraceMerging: true
    };
    Object.assign(this.options, options);
  }

  async install() {
    return RNSentry.startWithDsnString(this._dsn, this.options).then(() => {
      if (this.options.deactivateStacktraceMerging === false) {
        this._activateStacktraceMerging();
        const eventEmitter = new NativeEventEmitter(RNSentryEventEmitter);
        eventEmitter.addListener(RNSentryEventEmitter.MODULE_TABLE, moduleTable => {
          try {
            this._updateIgnoredModules(JSON.parse(moduleTable.payload));
          } catch (e) {
            // https://github.com/getsentry/react-native-sentry/issues/241
            // under some circumstances the the JSON is not valid
            // the reason for this is yet to be found
          }
        });
      }
      RNSentry.setLogLevel(this.options.logLevel);
    });
  }

  _cloneObject(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  nativeCrash() {
    RNSentry.crash();
  }

  captureEvent(event) {
    RNSentry.captureEvent(this._cloneObject(event));
  }

  setUserContext(user) {
    RNSentry.setUser(this._cloneObject(user));
  }

  setTagsContext(tags) {
    RNSentry.setTags(this._cloneObject(tags));
  }

  setExtraContext(extra) {
    RNSentry.setExtra(this._cloneObject(extra));
  }

  addExtraContext(key, value) {
    RNSentry.addExtra(key, value);
  }

  captureBreadcrumb(breadcrumb) {
    RNSentry.captureBreadcrumb(this._cloneObject(breadcrumb));
  }

  clearContext() {
    RNSentry.clearContext();
  }

  _updateIgnoredModules(modules) {
    const values = Object.values(modules);
    const keys = Object.keys(modules);
    for (let i = 0; i < values.length; i++) {
      const moduleName = values[i].replace(/RCT/, '');
      const moduleID = keys[i];
      if (this._ignoredModules[moduleID]) {
        continue;
      }
      this._addIgnoredModule(moduleID, moduleName);
    }
  }

  _addIgnoredModule(moduleID, moduleName) {
    if (
      this.options.ignoreModulesExclude.indexOf(moduleName) === -1 &&
      (DEFAULT_MODULE_IGNORES.indexOf(moduleName) >= 0 ||
        this.options.ignoreModulesInclude.indexOf(moduleName) >= 0)
    ) {
      this._ignoredModules[moduleID] = true;
    }
  }

  _activateStacktraceMerging = async () => {
    return RNSentry.activateStacktraceMerging()
      .then(activated => {
        if (this._activatedMerging) {
          return;
        }
        this._ignoredModules = {};
        const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
        if (typeof __fbBatchedBridgeConfig !== 'undefined') {
          /* global __fbBatchedBridgeConfig */
          __fbBatchedBridgeConfig.remoteModuleConfig.forEach((module, moduleID) => {
            if (module !== null) {
              this._addIgnoredModule(moduleID, module[0]);
            }
          });
        } else if (BatchedBridge._remoteModuleTable) {
          for (let moduleID in BatchedBridge._remoteModuleTable) {
            if (BatchedBridge._remoteModuleTable.hasOwnProperty(moduleID)) {
              let moduleName = BatchedBridge._remoteModuleTable[moduleID];
              this._addIgnoredModule(moduleID, moduleName);
            }
          }
        }
        this._activatedMerging = true;
        this._overwriteEnqueueNativeCall();
      })
      .catch(function(reason) {
        // eslint-disable-next-line
        console.log(reason);
      });
  };

  _overwriteEnqueueNativeCall() {
    const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
    const original = BatchedBridge.enqueueNativeCall;
    const that = this;
    BatchedBridge.enqueueNativeCall = function(
      moduleID: number,
      methodID: number,
      params: Array<any>,
      onFail: ?Function,
      onSucc: ?Function
    ) {
      if (that._ignoredModules[moduleID]) {
        return original.apply(this, arguments);
      }
      params.push({
        __sentry_stack: new Error().stack,
        __sentry_moduleID: moduleID
      });
      return original.apply(this, arguments);
    };
  }
}
