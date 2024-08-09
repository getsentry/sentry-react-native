jest.mock('../../src/js/tracing/utils', () => ({
  ...jest.requireActual('../../src/js/tracing/utils'),
  isNearToNow: jest.fn(),
}));

import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, startSpanManual } from '@sentry/core';

import { ReactNativeTracing, ReactNavigationInstrumentation } from '../../src/js';
import { isNearToNow } from '../../src/js/tracing/utils';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';
import { expectStallMeasurements } from './stalltrackingutils';

jest.useFakeTimers({ advanceTimers: 1 });

describe('StallTracking with ReactNavigation', () => {
  let client: TestClient;
  let mockNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;

  beforeEach(() => {
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const rnavigation = new ReactNavigationInstrumentation();
    mockNavigation = createMockNavigationAndAttachTo(rnavigation);

    const rnTracing = new ReactNativeTracing({
      routingInstrumentation: rnavigation,
      enableStallTracking: true,
      enableNativeFramesTracking: false,
    });

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [rnTracing],
      enableAppStartTracking: false,
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Stall tracking supports idleTransaction with unfinished spans', async () => {
    (isNearToNow as jest.Mock).mockReturnValue(true);
    jest.runOnlyPendingTimers(); // Flush app start transaction
    mockNavigation.navigateToNewScreen();
    startSpanManual({ name: 'This child span will never finish' }, () => {});

    jest.runOnlyPendingTimers(); // Flush new screen transaction

    await client.flush();

    expectStallMeasurements(client.event?.measurements);
  });
});
