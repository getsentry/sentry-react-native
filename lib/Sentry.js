import {
    NativeModules
} from 'react-native';

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
        Sentry._activatedMerging = false;
        RNSentry.startWithDsnString(Sentry._dsn);
        if (Sentry._deactivateStacktraceMerging === false) {
            Sentry.activateStacktraceMerging();
        }
    }

    static config(dsn, options) {
       if (dsn.constructor !== String) {
            throw new Error('Sentry: A DSN must be provided');
        }
        if (!RNSentry) {
            throw new Error('Sentry: There is no native client installed.');
        }
        Sentry._deactivateStacktraceMerging = false;
        if (options && options.deactivateStacktraceMerging) {
            Sentry._deactivateStacktraceMerging = true;
        }
        Sentry._dsn = dsn;
        return Sentry;
    }

    static setLogLevel = (level) => {
        RNSentry.setLogLevel(level);
    }

    static nativeCrash = () => {
        RNSentry.crash();
    }

    static setUserContext = (user) => {
        RNSentry.setUser(user);
    }

    static setTagsContext = (tags) => {
        RNSentry.setTags(tags);
    }

    static setExtraContext = (extras) => {
        RNSentry.setExtras(extras);
    }

    static captureMessage = (message, options) => {
        if (options === undefined) {
            options = {
                level: SentrySeverity.Error
            };
        }
        RNSentry.captureMessage(message, options.level);
    }

    static activateStacktraceMerging = async() => {
        return RNSentry.activateStacktraceMerging().then(activated => {
            if (Sentry._activatedMerging) {
                return;
            }
            Sentry._activatedMerging = true;
            Sentry._overwriteEnqueueNativeCall();
        });
    }

    static _overwriteEnqueueNativeCall = () => {
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
