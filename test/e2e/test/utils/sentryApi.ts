import type { Event } from '@sentry/types';

const baseUrl = 'https://sentry.io/api/0/projects/sentry-sdks/sentry-react-native';

interface ApiEvent extends Event {
  /**
   * The event returned from the API uses eventID
   */
  eventID: string;
}

const RETRY_COUNT = 600;
const RETRY_INTERVAL = 1000;

const fetchFromSentry = async (url: string): Promise<Response> => {
  expect(process.env.SENTRY_AUTH_TOKEN).toBeDefined();
  expect(process.env.SENTRY_AUTH_TOKEN?.length).toBeGreaterThan(0);

  const request = () =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      method: 'GET',
    });

  let retries = 0;
  const retrier = (response: Response): Promise<Response> =>
    new Promise((resolve, reject) => {
      if (response.status === 200) {
        resolve(response);
      } else if (response.status === 403) {
        reject(new Error(`Could not fetch ${url}: ${response.statusText}`));
      } else if (retries < RETRY_COUNT) {
        setTimeout(() => {
          retries++;
          // eslint-disable-next-line no-console
          console.log(`API request (${url}) failed with: ${response.statusText}. Retrying. Retry number: ${retries}/${RETRY_COUNT}`);
          resolve(request().then(retrier));
        }, RETRY_INTERVAL);
      } else {
        reject(new Error(`Could not fetch ${url} within retry limit.`));
      }
    });

  return request().then(retrier);
}

const fetchEvent = async (eventId: string): Promise<ApiEvent> => {
  const response = await fetchFromSentry(`${baseUrl}/events/${eventId}/`);
  const json = await response.json()
  return json as ApiEvent;
};

const fetchReplay = async (replayId: string): Promise<any> => {
  const response = await fetchFromSentry(`${baseUrl}/replays/${replayId}/`);
  return response.json();
};

const fetchReplaySegmentVideo = async (replayId: string, segment: number): Promise<Blob> => {
  const response = await fetchFromSentry(`${baseUrl}/replays/${replayId}/videos/${segment}/`);
  return response.blob();
};

export { fetchEvent, fetchReplay, fetchReplaySegmentVideo };
