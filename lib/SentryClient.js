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

        this.handleUncaughtErrors();
        this.handlePromiseRejections();
    }

    static setLogLevel = (level) => {
        if (!RNSentry) {
            throw new Error('SentryClient: There is no native client installed.');
        }
        RNSentry.setLogLevel(level);
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

}
