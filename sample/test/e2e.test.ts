// tslint:disable: no-unsafe-any
import wd from 'wd';
import path from 'path';

import {fetchEvent} from '../utils/fetchEvent';

const T_30_SECONDS_IN_MS = 30e3;
const T_120_SECONDS_IN_MS = 120e3;
const T_20_MINUTES_IN_MS = 20 * 60e3;
jasmine.DEFAULT_TIMEOUT_INTERVAL = T_20_MINUTES_IN_MS;
const PORT = 4723;

const driver = wd.promiseChainRemote('localhost', PORT);

jest.setTimeout(T_20_MINUTES_IN_MS);

beforeAll(async () => {
  const config =
    process.env.PLATFORM === 'android'
      ? {
          platformName: 'Android',

          deviceName: 'Android Emulator',

          app: './android/app/build/outputs/apk/release/app-release.apk',
          newCommandTimeout: 600000,
        }
      : {
          app: 'io.sentry.sample',
          deviceName: 'iPhone 13',
          platformName: 'iOS',
          newCommandTimeout: 600000,
          automationName: 'XCUITest',
          derivedDataPath: path.resolve('./xc-build'),
          showXcodeLog: true,
          usePrebuiltWDA: true,
        };

  await driver.init(config);
  await driver.sleep(T_120_SECONDS_IN_MS); // try to wait extra long to see if it helps
  // in case it does helper function that waits for elements would be nice

  expect(await driver.hasElementByAccessibilityId('openEndToEndTests')).toBe(
    true,
  );
  const element = await driver.elementByAccessibilityId('openEndToEndTests');
  await element.click();
  await driver.sleep(T_30_SECONDS_IN_MS);
});

beforeEach(async () => {
  await driver.hasElementByAccessibilityId('clearEventId');
  const element = await driver.elementByAccessibilityId('clearEventId');
  await element.click();
  await driver.sleep(T_30_SECONDS_IN_MS);
});

describe('End to end tests for common events', () => {
  test('captureMessage', async () => {
    expect(await driver.hasElementByAccessibilityId('captureMessage')).toBe(
      true,
    );

    const element = await driver.elementByAccessibilityId('captureMessage');
    await element.click();

    await driver.sleep(100);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    expect(await driver.hasElementByAccessibilityId('captureException')).toBe(
      true,
    );

    const element = await driver.elementByAccessibilityId('captureException');
    await element.click();

    await driver.sleep(100);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('unhandledPromiseRejection', async () => {
    expect(
      await driver.hasElementByAccessibilityId('unhandledPromiseRejection'),
    ).toBe(true);

    const element = await driver.elementByAccessibilityId(
      'unhandledPromiseRejection',
    );
    await element.click();

    // Promises needs a while to fail
    await driver.sleep(5000);

    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('close', async () => {
    expect(await driver.hasElementByAccessibilityId('close')).toBe(true);

    const element = await driver.elementByAccessibilityId('close');
    await element.click();

    // Wait a while in case
    await driver.sleep(5000);

    // This time we don't expect an eventId
    expect(await driver.hasElementByAccessibilityId('eventId')).toBe(true);
    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    expect(eventId).toBe('');
  });
});
