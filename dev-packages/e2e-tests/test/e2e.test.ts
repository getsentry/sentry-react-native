/* eslint-disable import/no-unresolved */
import path from 'path';
import type { RemoteOptions } from 'webdriverio';
import { remote } from 'webdriverio';

import { fetchEvent } from './utils/fetchEvent';
import { waitForTruthyResult } from './utils/waitFor';

const DRIVER_NOT_INITIALIZED = 'Driver not initialized';

const T_20_MINUTES_IN_MS = 20 * 60e3;
jest.setTimeout(T_20_MINUTES_IN_MS);

let driver: WebdriverIO.Browser | null = null;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getElement(accessibilityId: string): Promise<WebdriverIO.Element> {
  if (!driver) {
    throw new Error(DRIVER_NOT_INITIALIZED);
  }
  const element = await driver.$(`~${accessibilityId}`);
  await element.waitForDisplayed({ timeout: 60_000 });
  return element;
}

async function waitForEventId(): Promise<string> {
  const element = await getElement('eventId');
  let value: string;
  await waitForTruthyResult(async () => {
    value = await element.getText();
    return value.length > 0;
  });
  return value!;
}

async function waitUntilEventIdIsEmpty() {
  const element = await getElement('eventId');
  await waitForTruthyResult(async () => (await element.getText()).length === 0);
}

beforeAll(async () => {
  const conf: RemoteOptions = {
    logLevel: 'info',
    port: 4723,
    capabilities: {},
  };

  if (process.env.APPIUM_APP === undefined) {
    throw new Error('APPIUM_APP environment variable must be set');
  }
  if (process.env.PLATFORM === 'ios' && process.env.APPIUM_DERIVED_DATA === undefined) {
    throw new Error('APPIUM_DERIVED_DATA environment variable must be set');
  }

  if (process.env.PLATFORM === 'android') {
    conf.capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UIAutomator2',
      'appium:app': process.env.APPIUM_APP,
    };
  } else {
    conf.capabilities = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:app': process.env.APPIUM_APP,
      // DerivedData of the WebDriverRunner Xcode project.
      'appium:derivedDataPath': path.resolve(process.env.APPIUM_DERIVED_DATA || ''),
      'appium:showXcodeLog': true,
      'appium:usePrebuiltWDA': true,
    };
  }

  if (process.env.DEVICE !== undefined) {
    conf.capabilities['appium:deviceName'] = process.env.DEVICE;
  }

  // 5 minutes - to accommodate the timeouts for things like getting events from Sentry.
  conf.capabilities['appium:newCommandTimeout'] = 300_000;

  driver = await remote(conf);

  const maxInitTries = 3;
  for (let i = 1; i <= maxInitTries; i++) {
    if (i === maxInitTries) {
      await getElement('eventId');
    } else {
      try {
        await getElement('eventId');
        break;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log(error);
      }
    }
  }
});

describe('End to end tests for common events', () => {
  afterAll(async () => {
    await driver?.deleteSession();
  });

  beforeEach(async () => {
    const element = await getElement('clearEventId');
    await element.click();
    await waitUntilEventIdIsEmpty();
  });

  afterEach(async () => {
    const testName = expect.getState().currentTestName;
    const fileName = `screen-${testName}.png`.replace(/[^0-9a-zA-Z-+.]/g, '_');
    await driver?.saveScreenshot(fileName);
  });

  test('captureMessage', async () => {
    const element = await getElement('captureMessage');
    await element.click();

    const eventId = await waitForEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('captureException', async () => {
    const element = await getElement('captureException');
    await element.click();

    const eventId = await waitForEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('unhandledPromiseRejection', async () => {
    const element = await getElement('unhandledPromiseRejection');
    await element.click();

    const eventId = await waitForEventId();
    const sentryEvent = await fetchEvent(eventId);
    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test('close', async () => {
    const element = await getElement('close');
    await element.click();

    // Wait a while in case it gets set.
    await sleep(5000);

    // This time we don't expect an eventId.
    await waitUntilEventIdIsEmpty();
  });
});
