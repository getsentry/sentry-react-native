import {
    NativeModules
} from 'react-native';
import Raven from 'raven-js';
require('raven-js/plugins/react-native')(Raven);

const {
    RNSentry
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
    Fatal: 0,
    Error: 1,
    Warning: 2,
    Info: 3,
    Debug: 4
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
            Sentry._client = new NativeClient(Sentry._dsn, Sentry._options);
        } else {
            Sentry._client = new RavenClient(Sentry._dsn, Sentry._options);
        }
    }

    static config(dsn, options) {
        if (dsn.constructor !== String) {
            throw new Error('Sentry: A DSN must be provided');
        }
        Sentry._dsn = dsn;
        Sentry._options = options;
        return Sentry;
    }

    static nativeCrash = () => {
        Sentry._client.nativeCrash();
    }

    static setUserContext = (user) => {
        Sentry._client.setUserContext(user);
    }

    static setTagsContext = (tags) => {
        Sentry._client.setTagsContext(tags);
    }

    static setExtraContext = (extras) => {
        Sentry._client.setExtraContext(extras);
    }

    static captureMessage = (message, options) => {
        Sentry._client.captureMessage(message, options);
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
        RNSentry.startWithDsnString(this._dsn);

        this._deactivateStacktraceMerging = false;
        if (options && options.deactivateStacktraceMerging) {
            this._deactivateStacktraceMerging = true;
        }
        if (options && options.logLevel) {
            RNSentry.setLogLevel(options.logLevel);
        }
        this._ignoreModulesExclude = [];
        if (options && options.ignoreModulesExclude) {
            this._ignoreModulesExclude = options.ignoreModulesExclude;
        }
        this._ignoreModulesInclude = [];
        if (options && options.ignoreModulesInclude) {
            this._ignoreModulesInclude = options.ignoreModulesInclude;
        }
        if (this._deactivateStacktraceMerging === false) {
            this._activateStacktraceMerging();
        }
    }

    nativeCrash = () => {
        RNSentry.crash();
    }

    setUserContext = (user) => {
        RNSentry.setUser(user);
    }

    setTagsContext = (tags) => {
        RNSentry.setTags(tags);
    }

    setExtraContext = (extras) => {
        RNSentry.setExtras(extras);
    }

    captureMessage = (message, options) => {
        if (options === undefined) {
            options = {
                level: SentrySeverity.Error
            };
        }
        RNSentry.captureMessage(message, options.level);
    }

    _activateStacktraceMerging = async() => {
        return RNSentry.activateStacktraceMerging().then(activated => {
            if (this._activatedMerging) {
                return;
            }
            this._ignoredModules = {};
            __fbBatchedBridgeConfig.remoteModuleConfig.forEach((module, moduleID) => {
                if (module !== null &&
                    this._ignoreModulesExclude.indexOf(module[0]) == -1 &&
                        (DEFAULT_MODULE_IGNORES.indexOf(module[0]) >= 0 ||
                        this._ignoreModulesInclude.indexOf(module[0]) >= 0)) {
                    this._ignoredModules[moduleID] = true;
                }
            });
            this._activatedMerging = true;
            this._overwriteEnqueueNativeCall();
        });
    }

    _overwriteEnqueueNativeCall = () => {
        const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
        const original = BatchedBridge.enqueueNativeCall;
        const that = this;
        BatchedBridge.enqueueNativeCall = function(moduleID: number, methodID: number, params: Array < any > , onFail: ? Function, onSucc : ? Function) {
            if (that._ignoredModules[moduleID]) {
                return original.apply(this, arguments);
            }
            params.push({ '__sentry_stack': new Error().stack });
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
        if (options === null || options === undefined) {
            options = {};
        }
        Object.assign(options, {
            allowSecretKey: true
        });
        Raven.config(dsn, options).install();
    }

    nativeCrash = () => {
        /*eslint no-console:0*/
        window.console && console.error && console.error("nativeCrash is not support with the RavenClient");
    }

    setUserContext = (user) => {
        Raven.setUserContext(user);
    }

    setTagsContext = (tags) => {
        Raven.setTagsContext(tags);
    }

    setExtraContext = (extras) => {
        Raven.setExtraContext(extras)
    }

    captureMessage = async(message, options) => {
        if (options && options.level) {
            switch (options.level) {
                case SentrySeverity.Warning:
                    options.level = 'warning';
                    break;
                case SentrySeverity.Info:
                    options.level = 'info';
                    break;
                default:
                    options.level = 'error';
            }
        }
        Raven.captureMessage(message, options);
    }
}
