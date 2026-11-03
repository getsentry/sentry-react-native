import type { DebugImage } from '@sentry/core';

import { setCurrentClient } from '@sentry/core';

import { jsHangTrackingIntegration } from '../../src/js/integrations/jsHangTracking';
import { getDebugMetadata } from '../../src/js/profiling/debugid';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { NATIVE } from '../mockWrapper';

jest.mock('../../src/js/wrapper', () => jest.requireActual('../mockWrapper'));
jest.mock('../../src/js/profiling/debugid');

const DEBUG_IMAGE: DebugImage = {
  type: 'sourcemap',
  code_file: 'app:///main.jsbundle',
  debug_id: '12345678-1234-1234-1234-1234567890ab',
};

function initClient(integration = jsHangTrackingIntegration()): TestClient {
  const client = new TestClient(getDefaultTestClientOptions({ integrations: [integration] }));
  setCurrentClient(client);
  client.init();
  return client;
}

describe('jsHangTrackingIntegration', () => {
  const mockedGetDebugMetadata = getDebugMetadata as jest.MockedFunction<typeof getDebugMetadata>;

  beforeEach(() => {
    mockedGetDebugMetadata.mockReturnValue([DEBUG_IMAGE]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not start native tracking before the native SDK is initialized', () => {
    initClient();

    expect(NATIVE.startJsHangTracking).not.toHaveBeenCalled();
  });

  it('starts native tracking with the default timeout and the bundle debug images after init', () => {
    const client = initClient();

    // @ts-expect-error Only available on ReactNativeClient
    client.emit('afterInit');

    expect(NATIVE.startJsHangTracking).toHaveBeenCalledWith({
      timeoutIntervalMs: 2000,
      debugImages: [DEBUG_IMAGE],
    });
  });

  it('converts the timeout interval from seconds to milliseconds', () => {
    const client = initClient(jsHangTrackingIntegration({ timeoutIntervalSeconds: 0.5 }));

    // @ts-expect-error Only available on ReactNativeClient
    client.emit('afterInit');

    expect(NATIVE.startJsHangTracking).toHaveBeenCalledWith(expect.objectContaining({ timeoutIntervalMs: 500 }));
  });

  it('stops native tracking when the client closes', async () => {
    const client = initClient();

    await client.close();

    expect(NATIVE.stopJsHangTracking).toHaveBeenCalledTimes(1);
  });
});
