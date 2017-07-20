import Raven from 'raven-js';
import {Sentry, SentryLog} from './Sentry';

export class RavenClient {
  constructor(dsn, options) {
    if (dsn.constructor !== String) {
      throw new Error('SentryClient: A DSN must be provided');
    }
    this._dsn = dsn;
    this.options = {
      allowSecretKey: true,
      allowDuplicates: Sentry.isNativeClientAvailable()
    };
    Object.assign(this.options, options);
    Raven.addPlugin(
      require('./raven-plugin'),
      {
        nativeClientAvailable: Sentry.isNativeClientAvailable()
      },
      data => {
        if (Sentry.options.internal) {
          data.dist = Sentry.options.internal.dist;
        }
      }
    );

    Raven.config(dsn, this.options).install();
    if (options.logLevel >= SentryLog.Debug) {
      Raven.debug = true;
    }
    if (Sentry.isNativeClientAvailable()) {
      // We overwrite the default transport handler when the native
      // client is available, because we want to send the event with native
      Raven.setTransport(transportOptions => {
        Sentry._captureEvent(transportOptions.data);
      });
      Raven.setBreadcrumbCallback(Sentry._breadcrumbCallback);
      const oldCaptureBreadcrumb = Raven.captureBreadcrumb;
      Raven.captureBreadcrumb = function(obj) {
        if (obj.data && typeof obj.data === 'object') {
          obj.data = Object.assign({}, obj.data);
        }
        return oldCaptureBreadcrumb.apply(this, arguments);
      };
    }
  }

  setDataCallback(callback) {
    Raven.setDataCallback(callback);
  }

  setUserContext(user) {
    Raven.setUserContext(user);
  }

  setTagsContext(tags) {
    Raven.setTagsContext(tags);
  }

  setExtraContext(extra) {
    Raven.setExtraContext(extra);
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

  setRelease(release) {
    Raven.setRelease(release);
  }

  clearContext() {
    return Raven.clearContext();
  }

  context(options, func, args) {
    return Raven.context(options, func, args);
  }

  wrap(options, func, _before) {
    return Raven.wrap(options, func, _before);
  }
}
