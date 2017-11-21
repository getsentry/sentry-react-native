Additional Configuration
------------------------

These are functions you can call in your javascript code:

.. sourcecode:: javascript

    import {
      Sentry,
      SentrySeverity,
      SentryLog
    } from 'react-native-sentry';

    // disable stacktrace merging
    Sentry.config("___DSN___", {
      deactivateStacktraceMerging: false, // default: true | Deactivates the stacktrace merging feature
      logLevel: SentryLog.Debug, // default SentryLog.None | Possible values:  .None, .Error, .Debug, .Verbose
      disableNativeIntegration: false, // default: false | Deactivates the native integration and only uses raven-js
      handlePromiseRejection: true // default: true | Handle unhandled promise rejections
      // sampleRate: 0.5 // default: 1.0 | Only set this if you don't want to send every event so e.g.: 0.5 will send 50% of all events
      // These two options will only be considered if stacktrace merging is active
      // Here you can add modules that should be ignored or exclude modules
      // that should no longer be ignored from stacktrace merging
      // ignoreModulesExclude: ["I18nManager"], // default: [] | Exclude is always stronger than include
      // ignoreModulesInclude: ["RNSentry"], // default: [] | Include modules that should be ignored too
      // ---------------------------------
    }).install();

    // set a callback after an event was successfully sentry
    // its only guaranteed that this event contains `event_id` & `level`
    Sentry.setEventSentSuccessfully((event) => {
      // can also be called outside this block but maybe null
      // Sentry.lastEventId(); -> returns the last event_id after the first successfully sent event
      // Sentry.lastException(); -> returns the last event after the first successfully sent event
    });

    Sentry.setShouldSendCallback((event) => {
      return true; // if return false, event will not be sent
    });

    // Sentry.lastException(); // Will return the last sent error event
    // Sentry.lastEventId(); // Will return the last event id

    // export an extra context
    Sentry.setExtraContext({
      "a_thing": 3,
      "some_things": {"green": "red"},
      "foobar": ["a", "b", "c"],
      "react": true,
      "float": 2.43
    });

    // set the tag context
    Sentry.setTagsContext({
      "environment": "production",
      "react": true
    });

    // set the user context
    Sentry.setUserContext({
      email: "john@apple.com",
      userID: "12341",
      username: "username",
      extra: {
        "is_admin": false
      }
    });

    // set a custom message
    Sentry.captureMessage("TEST message", {
      level: SentrySeverity.Warning
    }); // Default SentrySeverity.Error

    // capture an exception
    Sentry.captureException(new Error('Oops!'), {
      logger: 'my.module'
    });

    // capture a breadcrumb
    Sentry.captureBreadcrumb({
      message: 'Item added to shopping cart',
      category: 'action',
      data: {
         isbn: '978-1617290541',
         cartSize: '3'
      }
    });

    // This will trigger a crash in the native sentry client
    //Sentry.nativeCrash();
