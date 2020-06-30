import wd from 'wd';
import fetch from 'node-fetch';

/*
  You will need:
    .env with your SENTRY_EVENT_AUTH_KEY
    appium server running = `yarn run appium`
    a release build for android (throw new error won't work in debug) = `yarn android --variant=release`
    then run the tests with jest = `yarn test`
*/

// 10 minutes timeout.
jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;
const PORT = 4723;

const config = {
  platformName: 'Android',

  deviceName: 'Android Emulator',

  app: './android/app/build/outputs/apk/release/app-release.apk',
};

const driver = wd.promiseChainRemote('localhost', PORT);

const domain = 'sentry.io';
const getEventEndpoint = `/api/0/projects/sentry-test/react-native/events/`;

const fetchEventFromSentryApi = async (eventId) => {
  const url = `https://${domain}${getEventEndpoint}${eventId}/`;

  // @ts-ignore
  const request = new fetch.Request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // Note: Don't forget to set this environment variable.
      Authorization: `Bearer ${process.env.SENTRY_EVENT_AUTH_KEY}`,
    },
  });

  let retries = 0;
  const retryer = (json) =>
    new Promise((resolve, reject) => {
      if (json.detail === 'Event not found' && retries < 6) {
        setTimeout(() => {
          retries++;
          console.log(`Retrying api request. Retry number: ${retries}`);
          resolve(
            fetch(request)
              .then((res) => res.json())
              .then(retryer),
          );
        }, 30000);
      } else {
        resolve(json);
      }
    });

  const json = await fetch(request)
    .then((res) => res.json())
    .then(retryer);

  return json;
};

beforeAll(async () => {
  await driver.init(config);
  await driver.sleep(10000);
});

beforeEach(async () => {
  const element = await driver.elementByAccessibilityId('clearEventId');
  await element.click();
  await driver.sleep(2000);
});

describe('End to end tests for common events', () => {
  test('captureMessage', async () => {
    expect(await driver.hasElementByAccessibilityId('captureMessage')).toBe(
      true,
    );

    const element = await driver.elementByAccessibilityId('captureMessage');
    await element.click();

    await driver.sleep(500);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEventFromSentryApi(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    expect(await driver.hasElementByAccessibilityId('captureException')).toBe(
      true,
    );

    const element = await driver.elementByAccessibilityId('captureException');
    await element.click();

    await driver.sleep(500);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEventFromSentryApi(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('uncaught error', async () => {
    expect(await driver.hasElementByAccessibilityId('throwNewError')).toBe(
      true,
    );

    const element = await driver.elementByAccessibilityId('throwNewError');
    await element.click();

    await driver.sleep(500);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEventFromSentryApi(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });
});
