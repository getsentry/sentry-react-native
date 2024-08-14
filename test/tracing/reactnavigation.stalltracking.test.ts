jest.mock('../../src/js/tracing/utils', () => ({
  ...jest.requireActual('../../src/js/tracing/utils'),
  isNearToNow: jest.fn(),
}));

import { getCurrentScope, getGlobalScope, getIsolationScope, setCurrentClient, startSpanManual } from '@sentry/core';

import { reactNativeTracingIntegration, reactNavigationIntegration } from '../../src/js';
import { stallTrackingIntegration } from '../../src/js/tracing/integrations/stalltracking';
import { isNearToNow } from '../../src/js/tracing/utils';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { expectStallMeasurements } from './integrations/stallTracking/stalltrackingutils';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';

jest.useFakeTimers({ advanceTimers: 1 });

describe('StallTracking with ReactNavigation', () => {
  let client: TestClient;
  let mockNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;

  beforeEach(() => {
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const rnavigation = reactNavigationIntegration();
    mockNavigation = createMockNavigationAndAttachTo(rnavigation);

    const rnTracing = reactNativeTracingIntegration();

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [stallTrackingIntegration(), rnTracing],
      enableNativeFramesTracking: false,
      enableAppStartTracking: false,
      enableStallTracking: true,
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
