// tslint:disable: no-unsafe-any
import {remote, RemoteOptions} from 'webdriverio';
import path from 'path';

import {fetchEvent} from '../utils/fetchEvent';
import {waitForTruthyResult} from '../utils/waitFor';

const T_20_MINUTES_IN_MS = 20 * 60e3;
jest.setTimeout(T_20_MINUTES_IN_MS);

declare let driver: WebdriverIO.Browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getElement(accessibilityId: string) {
  const element = await driver.$(`~${accessibilityId}`);
  await element.waitForDisplayed({timeout: 60_000});
  return element;
}

async function waitForEventId() {
  const element = await getElement('eventId');
  let value: string;
  await waitForTruthyResult(async () => {
    value = await element.getText();
    return value.length > 0;
  });
  return value;
}

async function waitUntilEventIdIsEmpty() {
  const element = await getElement('eventId');
  await waitForTruthyResult(async () => (await element.getText()).length === 0);
}

beforeAll(async () => {
  const conf: RemoteOptions = {
    logLevel: 'info',
    port: 4723,
    capabilities: undefined,
  };

  if (process.env.PLATFORM === 'android') {
    conf.capabilities = {
      platformName: 'Android',
      'appium:automationName': 'UIAutomator2',
      'appium:app': './android/app/build/outputs/apk/release/app-release.apk',
    };
  } else {
    conf.capabilities = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:app':
        './ios/DerivedData/Build/Products/Release-iphonesimulator/sample.app',
      'appium:derivedDataPath': path.resolve('./ios/DerivedData'),
      'appium:showXcodeLog': true,
      'appium:usePrebuiltWDA': true,
    };
  }

  if (process.env.RUNTIME !== undefined) {
    conf.capabilities['appium:platformVersion'] = process.env.RUNTIME;
  }

  if (process.env.DEVICE !== undefined) {
    conf.capabilities['appium:deviceName'] = process.env.DEVICE;
  }

  // 5 minutes - to accommodate the timeouts for things like getting events from Sentry.
  conf.capabilities['appium:newCommandTimeout'] = 300_000;

  driver = await remote(conf);

  const maxInitTries = 3;
  for (var i = 1; i <= maxInitTries; i++) {
    const element = await getElement('openEndToEndTests');
    await element.click();
    if (i === maxInitTries) {
      await getElement('eventId');
    } else {
      try {
        await getElement('eventId');
        break;
      } catch (error) {
        console.log(error);
      }
    }
  }
});

afterAll(async () => {
  await driver.deleteSession();
});

beforeEach(async () => {
  const element = await getElement('clearEventId');
  await element.click();
  await waitUntilEventIdIsEmpty();
});

afterEach(async () => {
  const testName = expect.getState().currentTestName;
  const fileName = `screen-${testName}.png`.replace(/[^0-9a-zA-Z-+.]/g, '_');
  await driver.saveScreenshot(fileName);
});

describe('End to end tests for common events', () => {
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
