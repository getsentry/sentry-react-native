import { NativeModules } from 'react-native';
import Raven from 'raven-js';
require('raven-js/plugins/react-native')(Raven);

const {
    RNSentry
} = NativeModules;

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
            this._activatedMerging = true;
            this._overwriteEnqueueNativeCall();
        });
    }

    _overwriteEnqueueNativeCall = () => {
        let BatchedBridge = require('react-native/Libraries/BatchedBridge/BatchedBridge');
        let parseErrorStack = require('react-native/Libraries/Core/Devtools/parseErrorStack');
        let original = BatchedBridge.enqueueNativeCall;
        BatchedBridge.enqueueNativeCall = function(moduleID: number, methodID: number, params: Array<any>, onFail: ?Function, onSucc: ?Function) {
          const stack = parseErrorStack(new Error());
          let sendStacktrace = true;
          stack.forEach(function (frame) {
            if (frame.methodName) {
              const mN = frame.methodName
              if (mN.match("createAnimatedNode") ||
                mN.match("setupDevtools") ||
                mN.match("stopAnimation") ||
                mN.match("TimingAnimation") ||
                mN.match("startAnimatingNode") ||
                mN.match("AnimatedStyle") ||
                mN.match("_cancelLongPressDelayTimeout") ||
                mN.match("__startNativeAnimation") ||
                mN.match("extractEvents") ||
                mN.match("WebSocket.")) {
                sendStacktrace = false;
              }
            }
          });

          if (sendStacktrace) {
            params.push({'__sentry_stack' : stack});
          }
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
        Object.assign({ allowSecretKey: true }, options);
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
            switch(options.level) {
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
