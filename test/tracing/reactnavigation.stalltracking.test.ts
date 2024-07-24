import {
  addGlobalEventProcessor,
  getCurrentHub,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  setCurrentClient,
  startSpanManual,
} from '@sentry/core';

import { ReactNativeTracing, ReactNavigationInstrumentation } from '../../src/js';
import { _addTracingExtensions } from '../../src/js/tracing/addTracingExtensions';
import { RN_GLOBAL_OBJ } from '../../src/js/utils/worldwide';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';
import { createMockNavigationAndAttachTo } from './reactnavigationutils';
import { expectStallMeasurements } from './stalltrackingutils';

jest.useFakeTimers({ advanceTimers: true });

describe('StallTracking with ReactNavigation', () => {
  let client: TestClient;
  let mockNavigation: ReturnType<typeof createMockNavigationAndAttachTo>;

  beforeEach(() => {
    RN_GLOBAL_OBJ.__sentry_rn_v5_registered = false;
    _addTracingExtensions();

    getCurrentScope().clear();
    getIsolationScope().clear();
    getGlobalScope().clear();

    const rnavigation = new ReactNavigationInstrumentation();
    mockNavigation = createMockNavigationAndAttachTo(rnavigation);

    const rnTracing = new ReactNativeTracing({
      routingInstrumentation: rnavigation,
      enableStallTracking: true,
      enableNativeFramesTracking: false,
      enableAppStartTracking: false,
    });

    const options = getDefaultTestClientOptions({
      tracesSampleRate: 1.0,
      integrations: [rnTracing],
    });
    client = new TestClient(options);
    setCurrentClient(client);
    client.init();

    // We have to call this manually as setupOnce is executed once per runtime (global var check)
    rnTracing.setupOnce(addGlobalEventProcessor, getCurrentHub);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('Stall tracking supports idleTransaction with unfinished spans', async () => {
    jest.runOnlyPendingTimers(); // Flush app start transaction
    mockNavigation.navigateToNewScreen();
    startSpanManual({ name: 'This child span will never finish' }, () => {});

    jest.runOnlyPendingTimers(); // Flush new screen transaction

    await client.flush();

    expectStallMeasurements(client.event?.measurements);
  });
});
