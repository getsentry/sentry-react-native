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
    Debug: 2
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

export class Event {
  constructor(error) {
    this.errorClass = error.constructor.name;
    this.errorMessage = error.message;
    this.tags = {};
    this.severity = 'warning';
    this.stacktrace = error.stack;
    this.user = {};
  }


  toJSON = () => {
    return {
      errorClass: this.errorClass,
      errorMessage: this.errorMessage,
      severity: this.severity,
      stacktrace: this.stacktrace,
      user: this.user
    }
  }
}
