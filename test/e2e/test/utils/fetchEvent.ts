import type { Event } from '@sentry/types';
import fetch from 'node-fetch';

const domain = 'sentry.io';
const eventEndpoint = '/api/0/projects/sentry-sdks/sentry-react-native/events/';

interface ApiEvent extends Event {
  /**
   * The event returned from the API uses eventID
   */
  eventID: string;
}

const RETRY_COUNT = 600;
const RETRY_INTERVAL = 1000;

const fetchEvent = async (eventId: string): Promise<ApiEvent> => {
  const url = `https://${domain}${eventEndpoint}${eventId}/`;

  expect(process.env.SENTRY_AUTH_TOKEN).toBeDefined();
  expect(process.env.SENTRY_AUTH_TOKEN.length).toBeGreaterThan(0);

  const request = new fetch.Request(url, {
    headers: {
      Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    method: 'GET',
  });

  let retries = 0;
  const retryer = (jsonResponse: any) =>
    new Promise((resolve, reject) => {
      if (jsonResponse.detail === 'Event not found') {
        if (retries < RETRY_COUNT) {
          setTimeout(() => {
            retries++;
            // eslint-disable-next-line no-console
            console.log(`Retrying api request. Retry number: ${retries}`);
            resolve(
              fetch(request)
                .then(res => res.json())
                .then(retryer),
            );
          }, RETRY_INTERVAL);
        } else {
          reject(new Error('Could not fetch event within retry limit.'));
        }
      } else {
        resolve(jsonResponse);
      }
    });

  const json: ApiEvent = await fetch(request)
    // tslint:disable-next-line: no-unsafe-any
    .then(res => res.json())
    .then(retryer);

  return json;
};

export { fetchEvent };
