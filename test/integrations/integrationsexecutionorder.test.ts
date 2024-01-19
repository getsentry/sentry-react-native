import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');

import { addGlobalEventProcessor, defaultStackParser, getCurrentHub } from '@sentry/browser';
import type { Integration } from '@sentry/types';

import { ReactNativeClient } from '../../src/js/client';
import { getDefaultIntegrations } from '../../src/js/integrations/default';
import { isHermesEnabled, notWeb } from '../../src/js/utils/environment';
import { MOCK_DSN } from '../mockDsn';

describe('Integration execution order', () => {

  beforeEach(() => {
    (notWeb as jest.Mock).mockReturnValue(true);
    (isHermesEnabled as jest.Mock).mockReturnValue(true);
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.runAllTimers();
    jest.useRealTimers();
    // RN_GLOBAL_OBJ.__SENTRY__.globalEventProcessors = []; // resets integrations
  });

  it('NativeLinkedErrors is before RewriteFrames', async () => {
    const client = createTestClient();
    const { integrations } = client.getOptions();

    const nativeLinkedErrors = spyOnIntegrationById('NativeLinkedErrors', integrations);
    const rewriteFrames = spyOnIntegrationById('RewriteFrames', integrations);

    client.setupIntegrations();
    runSetupOnceIntegrationsForClient(client);

    client.captureException(new Error('test'));
    jest.runAllTimers();

    expect(nativeLinkedErrors.preprocessEvent).toHaveBeenCalledBefore(rewriteFrames.processEvent);
  });
});

interface IntegrationSpy {
  name: string;
  setupOnce?: Integration['setupOnce'] & jest.Mock;
  preprocessEvent?: Integration['preprocessEvent'] & jest.Mock;
  processEvent?: Integration['processEvent'] & jest.Mock;
}

function spyOnIntegrationById(id: string, integrations: Integration[]): IntegrationSpy {
  const candidate = integrations?.find((integration) => integration.name === id);
  if (!candidate) {
    throw new Error(`Integration ${id} not found`);
  }

  jest.spyOn(candidate, 'setupOnce');
  candidate.preprocessEvent && jest.spyOn(candidate, 'preprocessEvent');
  candidate.processEvent && jest.spyOn(candidate, 'processEvent');
  return candidate as IntegrationSpy;
}

function createTestClient(): ReactNativeClient {
  return new ReactNativeClient({
    dsn: MOCK_DSN,
    transport: () => ({
      send: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
    integrations: getDefaultIntegrations({
      integrations: [],
      transport: () => ({
        send: jest.fn().mockResolvedValue(undefined),
        flush: jest.fn().mockResolvedValue(true),
      }),
      stackParser: defaultStackParser,
    }),
    stackParser: defaultStackParser,
  });
}

function runSetupOnceIntegrationsForClient(client: ReactNativeClient): void {
  // In production integrations are setup only once, but in the tests we want them to setup on every init
  const integrations = client.getOptions().integrations;
  if (integrations) {
    for (const integration of integrations) {
      integration.setupOnce(addGlobalEventProcessor, getCurrentHub);
    }
  }
}
