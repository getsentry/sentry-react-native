import * as Sentry from '@sentry/react-native';
import { SeverityLevel } from '@sentry/types';

export const setScopeProperties = () => {
  const dateString = new Date().toString();

  Sentry.setUser({
    id: 'test-id-0',
    email: 'testing@testing.test',
    username: 'USER-TEST',
    specialField: 'special user field',
    specialFieldNumber: 418,
  });

  Sentry.setTag('SINGLE-TAG', dateString);
  Sentry.setTag('SINGLE-TAG-NUMBER', 100);
  Sentry.setTags({
    'MULTI-TAG-0': dateString,
    'MULTI-TAG-1': dateString,
    'MULTI-TAG-2': dateString,
  });

  Sentry.setExtra('SINGLE-EXTRA', dateString);
  Sentry.setExtra('SINGLE-EXTRA-NUMBER', 100);
  Sentry.setExtra('SINGLE-EXTRA-OBJECT', {
    message: 'I am a teapot',
    status: 418,
    array: ['boo', 100, 400, { objectInsideArray: 'foobar' }],
  });
  Sentry.setExtras({
    'MULTI-EXTRA-0': dateString,
    'MULTI-EXTRA-1': dateString,
    'MULTI-EXTRA-2': dateString,
  });

  Sentry.setContext('TEST-CONTEXT', {
    stringTest: 'Hello',
    numberTest: 404,
    objectTest: {
      foo: 'bar',
    },
    arrayTest: ['foo', 'bar', 400],
    nullTest: null,
    undefinedTest: undefined,
  });

  Sentry.addBreadcrumb({
    level: 'info' as SeverityLevel,
    message: `TEST-BREADCRUMB-INFO: ${dateString}`,
  });
  Sentry.addBreadcrumb({
    level: 'debug' as SeverityLevel,
    message: `TEST-BREADCRUMB-DEBUG: ${dateString}`,
  });
  Sentry.addBreadcrumb({
    level: 'error' as SeverityLevel,
    message: `TEST-BREADCRUMB-ERROR: ${dateString}`,
  });
  Sentry.addBreadcrumb({
    level: 'fatal' as SeverityLevel,
    message: `TEST-BREADCRUMB-FATAL: ${dateString}`,
  });
  Sentry.addBreadcrumb({
    level: 'info' as SeverityLevel,
    message: `TEST-BREADCRUMB-DATA: ${dateString}`,
    data: {
      stringTest: 'Hello',
      numberTest: 404,
      objectTest: {
        foo: 'bar',
      },
      arrayTest: ['foo', 'bar', 400],
      nullTest: null,
      undefinedTest: undefined,
    },
    category: 'TEST-CATEGORY',
  });

  console.log('Test scope properties were set.');
};
