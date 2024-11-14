import pRetry from 'p-retry';
import type { Event } from '@sentry/types';

const baseUrl = 'https://sentry.io/api/0/projects/sentry-sdks/sentry-react-native';

const RETRY_COUNT = 600;
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_TIMEOUT = 5_000;

function fetchFromSentry<T>(url: string, authToken: string, parserFn: (response: Response) => Promise<T>): Promise<T> {
  const toRetry = async () => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
      method: 'GET',
    });

    return (await parserFn(response)) as T;
  };

  return pRetry(toRetry, {
    retries: RETRY_COUNT,
    minTimeout: FIRST_RETRY_MS,
    maxTimeout: MAX_RETRY_TIMEOUT,
    factor: 2,
    onFailedAttempt: e => {
      console.log(`Failed attempt ${e.attemptNumber} of ${RETRY_COUNT}: ${e.message}`);
    },
  });
};

const fetchEvent = async (eventId: string, authToken: string): Promise<Event> =>
  fetchFromSentry(`${baseUrl}/events/${eventId}/json/`, authToken, async (response) => {
    const json = (await response.json()) as Event;
    if (!json.event_id) {
      throw new Error('No event ID found in the response');
    }
    return json;
  });

// biome-ignore lint/suspicious/noExplicitAny: We don't have the type
const fetchReplay = async (replayId: string, authToken: string): Promise<any> =>
  fetchFromSentry(`${baseUrl}/replays/${replayId}/`, authToken, async (response) => response.json());

const fetchReplaySegmentVideo = async (replayId: string, segment: number, authToken: string): Promise<Blob> =>
  fetchFromSentry(`${baseUrl}/replays/${replayId.replace(/\-/g, '')}/videos/${segment}/`, authToken, async (response) => response.blob());

export { fetchEvent, fetchReplay, fetchReplaySegmentVideo };
