// import Sentry = require('./Sentry'); // or import * as Sentry from '..'
import * as Sentry from '../lib/Sentry';

// var options: Sentry.Options = {
//     logLevel: Sentry.LogLevel.Verbose
// };

Sentry.config(null).install();
// Sentry.Client.config('https://public@sentry.io/1', options).install();

Sentry.captureMessage("test");
