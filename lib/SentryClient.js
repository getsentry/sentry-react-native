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

        RNSentry.startWithDsnString(this.dsn);

        this.registerErrorHandlers();
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

    captureMessage = async(message, level) => {
        RNSentry.captureMessage(message, level);
    }

    captureEvent = async(error, isFatal) => {
        if (!(error instanceof Error)) {
            console.warn('SentryClient: error must be of type Error');
            return;
        }
        RNSentry.captureEvent(new Event(error).toJSON());
    }

    activateStacktraceMerging = (BatchedBridge, parseErrorStack) => {
        //const BatchedBridge = require('BatchedBridge');
        let original = BatchedBridge.enqueueNativeCall;
        BatchedBridge.enqueueNativeCall = function(moduleID: number, methodID: number, params: Array<any>, onFail: ?Function, onSucc: ?Function) {
          //const parseErrorStack = require('parseErrorStack');
          const stack = parseErrorStack(new Error());
          let sendStacktrace = true;
          stack.forEach(function (frame) {
            if (frame.methodName) {
              const mN = frame.methodName
              if (mN.match("createAnimatedNode") ||
                mN.match("setupDevtools") ||
                mN.match("TimingAnimation") ||
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
        RNSentry.activateStacktraceMerging();
    }

    registerErrorHandlers = () => {
        if (ErrorUtils) {
            const previousHandler = ErrorUtils.getGlobalHandler();

            ErrorUtils.setGlobalHandler((error, isFatal) => {
                this.captureEvent(error, isFatal);
                if (previousHandler) {
                    previousHandler(error, isFatal);
                }
            });
        }
        const tracking = require('promise/setimmediate/rejection-tracking'),
            sentryClient = this;
        tracking.enable({
            allRejections: true,
            onUnhandled: function(id, error) {
                sentryClient.captureEvent(error);
            },
            onHandled: function() {}
        });
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

export class Event {
    constructor(error) {
        this.errorClass = error.constructor.name;
        this.errorMessage = error.message;
        this.tags = {};
        this.severity = 'warning';
        this.stacktrace = error.stack;
    }

    toJSON = () => {
        return {
            errorClass: this.errorClass,
            errorMessage: this.errorMessage,
            severity: this.severity,
            stacktrace: this.stacktrace,
        }
    }
}
