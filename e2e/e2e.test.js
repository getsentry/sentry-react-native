// tslint:disable: no-unsafe-any
import wd from "wd";
import path from "path";
import fetch from "node-fetch";

const domain = "sentry.io";
const eventEndpoint = `/api/0/projects/sentry-sdks/sentry-react-native/events/`;

const RETRY_COUNT = 20;
const RETRY_INTERVAL = 30000;

const fetchEvent = async (eventId) => {
  const url = `https://${domain}${eventEndpoint}${eventId}/`;

  const request = new fetch.Request(url, {
    headers: {
      Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  let retries = 0;
  const retryer = (jsonResponse) =>
    new Promise((resolve, reject) => {
      if (jsonResponse.detail === "Event not found") {
        if (retries < RETRY_COUNT) {
          setTimeout(() => {
            retries++;
            console.log(`Retrying api request. Retry number: ${retries}`);
            resolve(
              fetch(request)
                .then((res) => res.json())
                .then(retryer)
            );
          }, RETRY_INTERVAL);
        } else {
          reject(new Error("Could not fetch event within retry limit."));
        }
      } else {
        resolve(jsonResponse);
      }
    });

  const json = await fetch(request)
    // tslint:disable-next-line: no-unsafe-any
    .then((res) => res.json())
    .then(retryer);

  return json;
};

// 10 minutes timeout.
jasmine.DEFAULT_TIMEOUT_INTERVAL = 3e5;
const PORT = 4723;

const driver = wd.promiseChainRemote("localhost", PORT);

// 20 min timeout why not
jest.setTimeout(1.2e6);

beforeAll(async () => {
  const config =
    process.env.PLATFORM === "android"
      ? {
          platformName: "Android",

          deviceName: "Android Emulator",

          app: "./android/app/build/outputs/apk/release/app-release.apk",
          newCommandTimeout: 600000,
        }
      : {
          app: "io.sentry.sample",
          deviceName: "iPhone 13",
          platformName: "iOS",
          newCommandTimeout: 600000,
          automationName: "XCUITest",
          derivedDataPath: path.resolve("./xc-build"),
          showXcodeLog: true,
          usePrebuiltWDA: true,
        };

  await driver.init(config);
  await driver.sleep(10000);

  expect(await driver.hasElementByAccessibilityId("openEndToEndTests")).toBe(
    true
  );
  const element = await driver.elementByAccessibilityId("openEndToEndTests");
  await element.click();
  await driver.sleep(2000);
});

beforeEach(async () => {
  await driver.hasElementByAccessibilityId("clearEventId");
  const element = await driver.elementByAccessibilityId("clearEventId");
  await element.click();
  await driver.sleep(2000);
});

describe("End to end tests for common events", () => {
  test("captureMessage", async () => {
    expect(await driver.hasElementByAccessibilityId("captureMessage")).toBe(
      true
    );

    const element = await driver.elementByAccessibilityId("captureMessage");
    await element.click();

    await driver.sleep(100);

    expect(await driver.hasElementByAccessibilityId("eventId")).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId("eventId");
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test("captureException", async () => {
    expect(await driver.hasElementByAccessibilityId("captureException")).toBe(
      true
    );

    const element = await driver.elementByAccessibilityId("captureException");
    await element.click();

    await driver.sleep(100);

    expect(await driver.hasElementByAccessibilityId("eventId")).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId("eventId");
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test("unhandledPromiseRejection", async () => {
    expect(
      await driver.hasElementByAccessibilityId("unhandledPromiseRejection")
    ).toBe(true);

    const element = await driver.elementByAccessibilityId(
      "unhandledPromiseRejection"
    );
    await element.click();

    // Promises needs a while to fail
    await driver.sleep(5000);

    expect(await driver.hasElementByAccessibilityId("eventId")).toBe(true);

    const eventIdElement = await driver.elementByAccessibilityId("eventId");
    const eventId = await eventIdElement.text();

    await driver.sleep(10000);

    const sentryEvent = await fetchEvent(eventId);

    expect(sentryEvent.eventID).toMatch(eventId);
  });

  test("close", async () => {
    expect(await driver.hasElementByAccessibilityId("close")).toBe(true);

    const element = await driver.elementByAccessibilityId("close");
    await element.click();

    // Wait a while in case
    await driver.sleep(5000);

    // This time we don't expect an eventId
    expect(await driver.hasElementByAccessibilityId("eventId")).toBe(true);
    const eventIdElement = await driver.elementByAccessibilityId("eventId");
    const eventId = await eventIdElement.text();

    expect(eventId).toBe("");
  });
});
