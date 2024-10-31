import pRetry from 'p-retry';
import type { Event } from '@sentry/types';

const domain = 'sentry.io';
const eventEndpoint = 'api/0/projects/sentry-sdks/sentry-react-native/events';

const RETRY_COUNT = 600;
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_TIMEOUT = 5_000;

const fetchEvent = async (eventId: string, authToken: string): Promise<Event> => {
  const url = `https://${domain}/${eventEndpoint}/${eventId}/json/`;

  const toRetry = async () => {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      method: 'GET',
    });

    const json = (await response.json()) as Event;
    if (!json.event_id) {
      throw new Error('No event ID found in the response');
    }

    return json;
  };

  const response = await pRetry(toRetry, {
    retries: RETRY_COUNT,
    minTimeout: FIRST_RETRY_MS,
    maxTimeout: MAX_RETRY_TIMEOUT,
    factor: 2,
    onFailedAttempt: e => {
      console.log(`Failed attempt ${e.attemptNumber} of ${RETRY_COUNT}: ${e.message}`);
    },
  });

  return response;
};

export { fetchEvent };
