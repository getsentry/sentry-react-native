import {
    NativeModules
} from 'react-native';
import Raven from 'raven-js';;

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
            Sentry._nativeClient = new NativeClient(Sentry._dsn, Sentry.options);
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
        }
        Object.assign(Sentry.options, options);
        return Sentry;
    }

    static isNativeClientAvailable = () => {
        return (Sentry._nativeClient);
    }

    static crash = () => {
        Sentry._ravenClient.crash();
    }

    static nativeCrash = () => {
        Sentry._ravenClient.nativeCrash();
    }

    static setUserContext = (user) => {
        Sentry._ravenClient.setUserContext(user);
    }

    static setTagsContext = (tags) => {
        Sentry._ravenClient.setTagsContext(tags);
    }

    static setExtraContext = (extras) => {
        Sentry._ravenClient.setExtraContext(extras);
    }

    static captureMessage = (message, options) => {
        Sentry._ravenClient.captureMessage(message, options);
    }

    static context = (options, func, args) => {
        Sentry._ravenClient.context(options, func, args);
    }

    static captureException = (ex, options) => {
        Sentry._ravenClient.captureException(ex, options);
    }

    static captureBreadcrumb = (msg, options) => {
        Sentry._ravenClient.captureBreadcrumb(msg, options);
    }

    static log = (level, message) => {
        if (Sentry.options && Sentry.options.logLevel) {
            if (Sentry.options.logLevel < level) {
                return;
            }
            Raven._originalConsole.log(message);
        }
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
    }

    crash = () => {
        Sentry.log(SentryLog.Debug, 'Sentry: NativeClient: call crash');
        throw new Error('Sentry: NativeClient: TEST crash');
    }

    nativeCrash = () => {
        Sentry.log(SentryLog.Debug, 'Sentry: NativeClient: call nativeCrash');
        RNSentry.crash();
    }

    setUserContext = (user) => {
        Sentry.log(SentryLog.Debug, ['Sentry: NativeClient: call setUserContext', user]);
        RNSentry.setUser(user);
    }

    setTagsContext = (tags) => {
        Sentry.log(SentryLog.Debug, ['Sentry: NativeClient: call setTagsContext', tags]);
        RNSentry.setTags(tags);
    }

    setExtraContext = (extras) => {
        Sentry.log(SentryLog.Debug, ['Sentry: NativeClient: call setExtraContext', extras]);
        RNSentry.setExtras(extras);
    }

    captureMessage = (message, options) => {
        Sentry.log(SentryLog.Debug, ['Sentry: NativeClient: call captureMessage', message, options]);
        if (options === undefined) {
            options = {
                level: SentrySeverity.Error
            };
        }
        RNSentry.captureMessage(message, options.level);
    }

    _activateStacktraceMerging = async() => {
        Sentry.log(SentryLog.Debug, 'Sentry: NativeClient: call _activateStacktraceMerging');
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

    _overwriteEnqueueNativeCall = () => {
        const BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
        const original = BatchedBridge.enqueueNativeCall;
        const that = this;
        BatchedBridge.enqueueNativeCall = function(moduleID: number, methodID: number, params: Array < any > , onFail: ? Function, onSucc : ? Function) {
            if (that._ignoredModules[moduleID]) {
                return original.apply(this, arguments);
            }
            params.push({
                '__sentry_stack': new Error().stack,
                '__sentry_breadcrumbs': Raven._breadcrumbs // send breadcrumbs
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
        }
        Object.assign(this.options, options);
        Raven.addPlugin(require('./raven-plugin'), {
            'nativeClientAvailable': Sentry.isNativeClientAvailable()
        });
        Raven.config(dsn, this.options).install();
        if (Sentry.isNativeClientAvailable()) {
            // We overwrite the default transport handler when the native
            // client is available, because we want to send the event with native
            Raven.setTransport((options) => {
                console.log(options);
            });
        }
    }

    crash = () => {
        Sentry.log(SentryLog.Debug, 'Sentry: call crash');
        throw new Error("Sentry: TEST crash");
    }

    nativeCrash = () => {
        /*eslint no-console:0*/
        window.console && console.error && console.error("nativeCrash is not support with the RavenClient");
    }

    setUserContext = (user) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call setUserContext', user]);
        Raven.setUserContext(user);
    }

    setTagsContext = (tags) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call setTagsContext', tags]);
        Raven.setTagsContext(tags);
    }

    setExtraContext = (extra) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call setExtraContext', extra]);
        Raven.setExtraContext(extra)
    }

    context = (options, func, args) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call context', options, func, args]);
        Raven.context(options, func, args);
    }

    captureException = (ex, options) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call captureException', ex, options]);
        Raven.captureException(ex, options);
    }

    captureBreadcrumb = (msg, options) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call captureBreadcrumb', msg, options]);
        Raven.captureBreadcrumb(msg, options);
    }

    captureMessage = async(message, options) => {
        Sentry.log(SentryLog.Debug, ['Sentry: call captureMessage', message, options]);
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
