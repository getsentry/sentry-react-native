const baseUrl = 'https://sentry.io/api/0/projects/sentry-sdks/sentry-react-native';

const RETRY_COUNT = 600;
const RETRY_INTERVAL = 1000;
const requestHeaders = { 'Authorization': `Bearer ${sentryAuthToken}` }

// Top-level async doesn't seem to work so we can't sleep.
// Seems to work fine without it though, from the logs it seems to be rather slow anyway.
// TODO reach out on to Maestro & GrallJS GitHub issues
// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

function fetchFromSentry(url) {
  console.log(`Fetching ${url}`);
  let retries = 0;
  const shouldRetry = (response) => {
    switch (response.status) {
      case 200:
        return false;
      case 403:
        throw new Error(`Could not fetch ${url}: ${response.status} | ${response.body}`);
      default:
        if (retries++ < RETRY_COUNT) {
          console.log(`Request failed, retrying: ${retries}/${RETRY_COUNT}`);
          return true;
        }
        throw new Error(`Could not fetch ${url} within retry limit: ${response.status} | ${response.body}`);
    }
  }

  while (true) {
    const response = http.get(url, { headers: requestHeaders })
    if (!shouldRetry(response)) {
      console.log('Received data:');
      console.log(response.body);
      return json(response.body);
    }
    // await sleep(RETRY_INTERVAL);
  }
};

function setOutput(data) {
  for (const [key, value] of Object.entries(data)) {
    output[key] = value;
  }
}

// Note: "fetch" and "id" are script inputs, see for example assertEventIdIVisible.yml
switch (fetch) {
  case 'event': {
    const data = fetchFromSentry(`${baseUrl}/events/${id}/json/`);
    setOutput(data);
    break;
  }
  case 'replay': {
    const data = fetchFromSentry(`${baseUrl}/replays/${id}/`);
    setOutput(data);
    break;
  }
  case 'replaySegment': {
    const data = fetchFromSentry(`${baseUrl}/replays/${replayId}/videos/${segment}/`);
    setOutput(data);
    break;
  }
}
