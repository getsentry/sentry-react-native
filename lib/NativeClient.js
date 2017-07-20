import {NativeModules} from 'react-native';
const {RNSentry} = NativeModules;

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
      deactivateStacktraceMerging: false
    };
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
            if (
              module !== null &&
              this.options.ignoreModulesExclude.indexOf(module[0]) === -1 &&
              (DEFAULT_MODULE_IGNORES.indexOf(module[0]) >= 0 ||
                this.options.ignoreModulesInclude.indexOf(module[0]) >= 0)
            ) {
              this._ignoredModules[moduleID] = true;
            }
          });
        } else if (BatchedBridge._remoteModuleTable) {
          for (let module in BatchedBridge._remoteModuleTable) {
            if (BatchedBridge._remoteModuleTable.hasOwnProperty(module)) {
              let moduleName = BatchedBridge._remoteModuleTable[module];
              if (
                this.options.ignoreModulesExclude.indexOf(moduleName) === -1 &&
                (DEFAULT_MODULE_IGNORES.indexOf(moduleName) >= 0 ||
                  this.options.ignoreModulesInclude.indexOf(moduleName) >= 0)
              ) {
                this._ignoredModules[module] = true;
              }
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
        __sentry_stack: new Error().stack
      });
      return original.apply(this, arguments);
    };
  }
}
