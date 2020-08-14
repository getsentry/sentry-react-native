// tslint:disable: no-implicit-dependencies no-unsafe-any no-console
import {Event} from '@sentry/types';
import fetch from 'node-fetch';

const domain = 'sentry.io';
const eventEndpoint = `/api/0/projects/sentry-test/react-native/events/`;

interface ApiEvent extends Event {
  /**
   * The event returned from the API uses eventID
   */
  eventID: string;
}

const fetchEvent = async (eventId): Promise<ApiEvent> => {
  const url = `https://${domain}${eventEndpoint}${eventId}/`;

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
        if (retries < 20) {
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
          reject(new Error('Could not fetch event within retry limit.'));
        }
      } else {
        resolve(jsonResponse);
      }
    });

  const json: ApiEvent = await fetch(request)
    // tslint:disable-next-line: no-unsafe-any
    .then((res) => res.json())
    .then(retryer);

  return json;
};

export {fetchEvent};
