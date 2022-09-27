// tslint:disable: no-unsafe-any
import wdio from 'webdriverio';
import path from 'path';

import {fetchEvent} from '../utils/fetchEvent';

const T_30_SECONDS_IN_MS = 30e3;
const T_20_MINUTES_IN_MS = 20 * 60e3;
const PORT = 4723;

declare let driver: WebdriverIO.Browser;

jest.setTimeout(T_20_MINUTES_IN_MS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const config =
    process.env.PLATFORM === 'android'
      ? {
          platformName: 'Android',
          app: './android/app/build/outputs/apk/release/app-release.apk',
          newCommandTimeout: 600000,
        }
      : {
          platformName: 'iOS',
          deviceName: 'iPhone 12',
          app: './ios/DerivedData/Build/Products/Release-iphonesimulator/sample.app',
          newCommandTimeout: 600000,
          automationName: 'XCUITest',
          derivedDataPath: path.resolve('./ios/DerivedData'),
          showXcodeLog: true,
          usePrebuiltWDA: true,
        };

  driver = await wdio.remote({
    capabilities: config,
  });

  const element = await driver.$('~openEndToEndTests');
  await element.click();
});

beforeEach(async () => {
  const element = await driver.$('~clearEventId');
  await element.click();
  await sleep(T_30_SECONDS_IN_MS);
});

describe('End to end tests for common events', () => {
  test('captureMessage', async () => {
    const element = await driver.$('~captureMessage');
    await element.click();

    const eventIdElement = await driver.$('~eventId');
    const eventId = await eventIdElement.getText();

    await sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    const element = await driver.$('~captureException');
    await element.click();

    const eventIdElement = await driver.$('~eventId');
    const eventId = await eventIdElement.getText();

    await sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('unhandledPromiseRejection', async () => {
    const element = await driver.$('~unhandledPromiseRejection');
    await element.click();

    // Promises needs a while to fail
    await sleep(5000);

    const eventIdElement = await driver.$('~eventId');
    const eventId = await eventIdElement.getText();

    await sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('close', async () => {
    const element = await driver.$('~close');
    await element.click();

    // Wait a while in case
    await sleep(5000);

    // This time we don't expect an eventId
    const eventIdElement = await driver.$('~eventId');
    const eventId = await eventIdElement.getText();

    expect(eventId).toBe('');
  });
});
