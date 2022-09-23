// tslint:disable: no-unsafe-any
import wd from 'wd';
import path from 'path';

import { fetchEvent } from '../utils/fetchEvent';
import { waitForTruthyResult } from '../utils/waitFor';

const T_30_SECONDS_IN_MS = 30e3;
const T_20_MINUTES_IN_MS = 20 * 60e3;
const PORT = 4723;

const driver = wd.promiseChainRemote('localhost', PORT);

jest.setTimeout(T_20_MINUTES_IN_MS);

function waitForElementByAccessibilityId(accessibilityId: string) {
  return waitForTruthyResult(() =>
    driver.hasElementByAccessibilityId(accessibilityId),
  ).resolves.toBeTruthy();
}

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
        app: './ios/DerivedData/Build/Products/Release-iphonesimulator/sample.app',
        deviceName: 'iPhone 13',
        platformName: 'iOS',
        newCommandTimeout: 600000,
        automationName: 'XCUITest',
        derivedDataPath: path.resolve('./ios/DerivedData'),
        showXcodeLog: true,
        usePrebuiltWDA: true,
      };

  await driver.init(config);

  await waitForElementByAccessibilityId('openEndToEndTests');
  const element = await driver.elementByAccessibilityId('openEndToEndTests');
  await element.click();
});

beforeEach(async () => {
  await waitForElementByAccessibilityId('clearEventId');
  const element = await driver.elementByAccessibilityId('clearEventId');
  await element.click();
  await driver.sleep(T_30_SECONDS_IN_MS);
});

describe('End to end tests for common events', () => {
  test('captureMessage', async () => {
    await waitForElementByAccessibilityId('captureMessage');
    const element = await driver.elementByAccessibilityId('captureMessage');
    await element.click();

    await waitForElementByAccessibilityId('eventId');

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    await waitForElementByAccessibilityId('captureException');
    const element = await driver.elementByAccessibilityId('captureException');
    await element.click();

    await waitForElementByAccessibilityId('eventId');
    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('unhandledPromiseRejection', async () => {
    await waitForElementByAccessibilityId('unhandledPromiseRejection');
    const element = await driver.elementByAccessibilityId(
      'unhandledPromiseRejection',
    );
    await element.click();

    // Promises needs a while to fail
    await driver.sleep(5000);

    await waitForElementByAccessibilityId('eventId');

    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('close', async () => {
    await waitForElementByAccessibilityId('close');
    const element = await driver.elementByAccessibilityId('close');
    await element.click();

    // Wait a while in case
    await driver.sleep(5000);

    // This time we don't expect an eventId
    await waitForElementByAccessibilityId('eventId');
    const eventIdElement = await driver.elementByAccessibilityId('eventId');
    const eventId = await eventIdElement.text();

    expect(eventId).toBe('');
  });
});
