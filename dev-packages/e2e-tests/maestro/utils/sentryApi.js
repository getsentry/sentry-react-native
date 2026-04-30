const baseUrl = 'https://sentry.io/api/0/projects/sentry-sdks/sentry-react-native';

const RETRY_COUNT = 600;
const RETRY_INTERVAL = 1000;
const requestHeaders = { 'Authorization': `Bearer ${sentryAuthToken}` }

function sleep(ms) {
  // TODO reach out to Maestro & GrallJS via GitHub issues.
  //   return new Promise(resolve => setTimeout(resolve, ms));
  // Instead, we need to do a busy wait.
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // console.log(`Sleeping for ${until - Date.now()} ms`);
    try {
      http.get('http://127.0.0.1:1');
    } catch (e) {
      // Ignore
    }
  }
}

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
          console.log(`Request failed (HTTP ${response.status}), retrying: ${retries}/${RETRY_COUNT}`);
          return true;
        }
        throw new Error(`Could not fetch ${url} within retry limit: ${response.status} | ${response.body}`);
    }
  }

  while (true) {
    const response = http.get(url, { headers: requestHeaders })
    if (!shouldRetry(response)) {
      console.log(`Received HTTP ${response.status}: body length ${response.body.length}`);
      return response.body;
    }
    sleep(RETRY_INTERVAL);
  }
};

function setOutput(data) {
  for (const [key, value] of Object.entries(data)) {
    console.log(`Setting output.${key} = '${value}'`);
    output[key] = value;
  }
}

// Note: "fetch", "id", "eventId", etc. are script inputs, see for example assertEventIdIVisible.yml
switch (fetch) {
  case 'event': {
    const data = json(fetchFromSentry(`${baseUrl}/events/${id}/json/`));
    setOutput({ eventId: data.event_id });
    break;
  }
  case 'replay': {
    // The replay_id is set by the SDK on the event before sending (in
    // contexts.replay.replay_id or _dsc.replay_id). It should be present
    // when the event is fetched from the API.
    // Retry a few times: on slow CI the native replay buffer may not have
    // captured a frame before the error was sent, so replay_id can be
    // missing. Re-fetching gives time for a subsequent event update or
    // for eventual consistency in the API.
    const REPLAY_ID_RETRIES = 10;
    const REPLAY_ID_RETRY_INTERVAL = 3000;
    let rawReplayId = null;
    for (let attempt = 0; attempt < REPLAY_ID_RETRIES; attempt++) {
      const event = json(fetchFromSentry(`${baseUrl}/events/${eventId}/json/`));
      rawReplayId = (event.contexts && event.contexts.replay && event.contexts.replay.replay_id)
        || (event._dsc && event._dsc.replay_id);
      if (rawReplayId) {
        break;
      }
      if (attempt < REPLAY_ID_RETRIES - 1) {
        console.log(`replay_id not yet on event, retrying: ${attempt + 1}/${REPLAY_ID_RETRIES}`);
        sleep(REPLAY_ID_RETRY_INTERVAL);
      }
    }
    if (!rawReplayId) {
      throw new Error('replay_id not available on the event after retries');
    }
    const replayId = rawReplayId.replace(/\-/g, '');
    const replay = json(fetchFromSentry(`${baseUrl}/replays/${replayId}/`));
    const segment = fetchFromSentry(`${baseUrl}/replays/${replayId}/videos/0/`);

    setOutput({
      replayId: replay.data.id,
      replayDuration: replay.data.duration,
      replaySegments: replay.data.count_segments,
      replayCodec: segment.slice(4, 12)
    });
    break;
  }
  default:
    throw new Error(`Unknown "fetch" value: '${fetch}'`);
}
