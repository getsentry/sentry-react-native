// import Sentry = require('./Sentry'); // or import * as Sentry from '..'
import {Sentry, SentryLog, SentrySeverity} from '../lib/Sentry';

Sentry.config(null).install();

var options = {
    logLevel: SentryLog.Verbose
};
Sentry.config('https://public@sentry.io/1', options).install();

Sentry.captureMessage("test");
