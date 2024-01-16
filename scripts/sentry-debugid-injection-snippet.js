// This is non minified version the debug id injection snippet used in the Metro plugin.
var _sentryDebugIds = {};
var _sentryDebugIdIdentifier = '';

if (typeof _sentryDebugIds === 'undefined') {
  _sentryDebugIds = {};
}

try {
  var stack = new Error().stack;
  if (stack) {
    _sentryDebugIds[stack] = '__SENTRY_DEBUG_ID__';
    // eslint-disable-next-line no-unused-vars
    _sentryDebugIdIdentifier = 'sentry-dbid-__SENTRY_DEBUG_ID__';
  }
} catch (e) {
  /**/
}
