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
  console.log(`[DEBUG] Fetching ${url}`);
  let retries = 0;
  const shouldRetry = (response) => {
    console.log(`[DEBUG] Response status: ${response.status}`);
    if (response.status !== 200) {
      console.log(`[DEBUG] Non-200 response body (first 1000 chars): ${response.body.slice(0, 1000)}`);
    }

    switch (response.status) {
      case 200:
        return false;
      case 403:
        throw new Error(`Could not fetch ${url}: ${response.status} | ${response.body}`);
      default:
        if (retries++ < RETRY_COUNT) {
          console.log(`[DEBUG] Request failed (HTTP ${response.status}), retrying: ${retries}/${RETRY_COUNT}`);
          return true;
        }
        throw new Error(`Could not fetch ${url} within retry limit: ${response.status} | ${response.body}`);
    }
  }

  while (true) {
    const response = http.get(url, { headers: requestHeaders })
    if (!shouldRetry(response)) {
      console.log(`[DEBUG] Received HTTP ${response.status}: body length ${response.body.length}`);
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
try {
  switch (fetch) {
    case 'event': {
      console.log(`[DEBUG] Fetching event with id: ${id}`);
      const data = json(fetchFromSentry(`${baseUrl}/events/${id}/json/`));
      console.log(`[DEBUG] Event data received, event_id: ${data.event_id}`);
      setOutput({ eventId: data.event_id });
      break;
    }
    case 'replay': {
      console.log(`[DEBUG] === Starting replay fetch for eventId: ${eventId} ===`);

      console.log(`[DEBUG] Step 1: Fetching event data`);
      const event = json(fetchFromSentry(`${baseUrl}/events/${eventId}/json/`));

      console.log(`[DEBUG] Event fetched successfully`);
      console.log(`[DEBUG] Event has _dsc: ${!!event._dsc}`);
      console.log(`[DEBUG] Event has contexts: ${!!event.contexts}`);
      console.log(`[DEBUG] Event has contexts.replay: ${!!event.contexts?.replay}`);

      if (event._dsc) {
        console.log(`[DEBUG] event._dsc keys: ${Object.keys(event._dsc).join(', ')}`);
        console.log(`[DEBUG] event._dsc.replay_id: ${event._dsc.replay_id}`);
      } else {
        console.log(`[DEBUG] event._dsc is undefined/null`);
      }

      if (event.contexts?.replay) {
        console.log(`[DEBUG] event.contexts.replay keys: ${Object.keys(event.contexts.replay).join(', ')}`);
        console.log(`[DEBUG] event.contexts.replay.replay_id: ${event.contexts.replay.replay_id}`);
      }

      console.log(`[DEBUG] Step 2: Extracting replay_id`);
      if (!event._dsc || !event._dsc.replay_id) {
        console.log(`[DEBUG] ERROR: No replay_id in event._dsc`);
        console.log(`[DEBUG] Event structure (first 2000 chars): ${JSON.stringify(event).slice(0, 2000)}`);
        throw new Error(`No replay_id found in event._dsc. Available: _dsc=${!!event._dsc}, contexts.replay=${!!event.contexts?.replay}`);
      }

      const replayId = event._dsc.replay_id.replace(/\-/g, '');
      console.log(`[DEBUG] Replay ID extracted: ${replayId} (raw: ${event._dsc.replay_id})`);

      console.log(`[DEBUG] Step 3: Fetching replay metadata`);
      const replay = json(fetchFromSentry(`${baseUrl}/replays/${replayId}/`));
      console.log(`[DEBUG] Replay metadata received: id=${replay.data?.id}, duration=${replay.data?.duration}, segments=${replay.data?.count_segments}`);

      console.log(`[DEBUG] Step 4: Fetching video segment`);
      const segment = fetchFromSentry(`${baseUrl}/replays/${replayId}/videos/0/`);
      const codec = segment.slice(4, 12);
      console.log(`[DEBUG] Video segment received: size=${segment.length} bytes, codec=${codec}`);

      setOutput({
        replayId: replay.data.id,
        replayDuration: replay.data.duration,
        replaySegments: replay.data.count_segments,
        replayCodec: codec
      });

      console.log(`[DEBUG] === Replay fetch completed successfully ===`);
      break;
    }
    default:
      throw new Error(`Unknown "fetch" value: '${fetch}'`);
  }
} catch (error) {
  console.log(`[DEBUG] === ERROR in sentryApi.js ===`);
  console.log(`[DEBUG] Error type: ${error.constructor.name}`);
  console.log(`[DEBUG] Error message: ${error.message}`);
  console.log(`[DEBUG] Error stack: ${error.stack}`);
  throw error;
}
