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

    static isNativeClientAvailable() {
        return (Sentry._nativeClient);
    }

    static crash() {
        throw new Error('Sentry: TEST crash');
    }

    static nativeCrash() {
        if (Sentry.isNativeClientAvailable()) {
            Sentry._nativeClient.nativeCrash();
        }
    }

    static setUserContext(user) {
        Sentry._ravenClient.setUserContext(user);
        if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setUserContext(user);
    }

    static setTagsContext(tags) {
        Sentry._ravenClient.setTagsContext(tags);
        if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setTagsContext(tags);
    }

    static setExtraContext(extra) {
        Sentry._ravenClient.setExtraContext(extra);
        if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.setExtraContext(extra);
    }

    static captureMessage(message, options) {
        Sentry._ravenClient.captureMessage(message, options);
    }

    static context(options, func, args) {
        Sentry._ravenClient.context(options, func, args);
    }

    static captureException(ex, options) {
        Sentry._ravenClient.captureException(ex, options);
    }

    static captureBreadcrumb(msg, options) {
        Sentry._ravenClient.captureBreadcrumb(msg, options);
    }

    static captureEvent(event) {
        if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureEvent(event);
    }

    static _breadcrumbCallback(crumb) {
        if (Sentry.isNativeClientAvailable()) Sentry._nativeClient.captureBreadcrumb(crumb);
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

    captureBreadcrumb(crumb) {
        RNSentry.captureBreadcrumb(crumb);
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
                '__sentry_stack': new Error().stack,
                '__sentry_breadcrumbs': [].slice.apply(Raven._breadcrumbs) // send breadcrumbs
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
                Sentry.captureEvent(options.data);
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

    setUserContext(user) {
        Raven.setUserContext(user);
    }

    setTagsContext(tags) {
        Raven.setTagsContext(tags);
    }

    setExtraContext(extra) {
        Raven.setExtraContext(extra)
    }

    context(options, func, args) {
        Raven.context(options, func, args);
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
}
