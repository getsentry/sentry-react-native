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

export class SentryClient {
    constructor(dsn) {
        if (dsn.constructor !== String) {
            throw new Error('SentryClient: A DSN must be provided');
        }
        if (!RNSentry) {
            throw new Error('SentryClient: There is no native client installed.');
        }

        this.dsn = dsn;
        this.activatedMerging = false;

        RNSentry.startWithDsnString(this.dsn);
    }

    static setLogLevel = (level) => {
        if (!RNSentry) {
            throw new Error('SentryClient: There is no native client installed.');
        }
        RNSentry.setLogLevel(level);
    }

    nativeCrash = () => {
        RNSentry.crash();
    }

    setUser = (user) => {
        RNSentry.setUser(user.toJSON());
    }

    setTags = (tags) => {
        RNSentry.setTags(tags);
    }

    setExtras = (extras) => {
        RNSentry.setExtras(extras);
    }

    captureMessage = (message, level) => {
        RNSentry.captureMessage(message, level);
    }

    activateStacktraceMerging = async(BatchedBridge, parseErrorStack) => {
        return RNSentry.activateStacktraceMerging().then(activated => {
            if (this.activatedMerging) {
                return;
            }
            this.activatedMerging = true;
            this._overwriteEnqueueNativeCall(BatchedBridge, parseErrorStack);
        });
    }

    _overwriteEnqueueNativeCall = (BatchedBridge, parseErrorStack) => {
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

export class User {
    constructor(userID, email, username, extra) {
        this.userID = userID
        this.email = email
        this.username = username
        this.extra = extra
    }

    toJSON = () => {
        return {
            userID: this.userID,
            email: this.email,
            username: this.username,
            extra: this.extra,
        }
    }
}
