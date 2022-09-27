// tslint:disable: no-unsafe-any
import {remote} from 'webdriverio';
import path from 'path';

import {fetchEvent} from '../utils/fetchEvent';
import {waitForTruthyResult} from '../utils/waitFor';

const T_20_MINUTES_IN_MS = 20 * 60e3;
jest.setTimeout(T_20_MINUTES_IN_MS);

declare let driver: WebdriverIO.Browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getEventId() {
  const element = await driver.$('~eventId');
  return await element.getText();
}
async function waitUntilEventIdIsEmpty(value: Boolean) {
  await waitForTruthyResult(async () => {
    const len = (await getEventId()).length;
    return value ? len === 0 : len > 0;
  });
}

beforeAll(async () => {
  let caps =
    process.env.PLATFORM === 'android'
      ? {
          platformName: 'Android',
          'appium:automationName': 'UIAutomator2',
          'appium:app':
            './android/app/build/outputs/apk/release/app-release.apk',
        }
      : {
          platformName: 'iOS',
          'appium:deviceName': 'iPhone 12',
          'appium:automationName': 'XCUITest',
          'appium:app':
            './ios/DerivedData/Build/Products/Release-iphonesimulator/sample.app',
          'appium:derivedDataPath': path.resolve('./ios/DerivedData'),
          'appium:showXcodeLog': true,
          'appium:usePrebuiltWDA': true,
        };

  driver = await remote({
    logLevel: 'info',
    port: 4723,
    capabilities: caps,
  });

  const element = await driver.$('~openEndToEndTests');
  await element.click();
});

beforeEach(async () => {
  const element = await driver.$('~clearEventId');
  await element.click();
  await waitUntilEventIdIsEmpty(true);
});

describe('End to end tests for common events', () => {
  test('captureMessage', async () => {
    const element = await driver.$('~captureMessage');
    await element.click();

    await waitUntilEventIdIsEmpty(false);
    const eventId = await getEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    const element = await driver.$('~captureException');
    await element.click();

    await waitUntilEventIdIsEmpty(false);
    const eventId = await getEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('unhandledPromiseRejection', async () => {
    const element = await driver.$('~unhandledPromiseRejection');
    await element.click();

    await waitUntilEventIdIsEmpty(false);
    const eventId = await getEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('close', async () => {
    const element = await driver.$('~close');
    await element.click();

    // Wait a while in case it gets set.
    await sleep(5000);

    // This time we don't expect an eventId.
    await waitUntilEventIdIsEmpty(true);
  });
});
