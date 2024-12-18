import * as mockWrapper from '../mockWrapper';
jest.mock('../../src/js/wrapper', () => mockWrapper);
jest.mock('../../src/js/utils/environment');

import { defaultStackParser } from '@sentry/browser';
import type { Integration } from '@sentry/core';

import { ReactNativeClient } from '../../src/js/client';
import { getDefaultIntegrations } from '../../src/js/integrations/default';
import type { ReactNativeClientOptions } from '../../src/js/options';
import { isHermesEnabled, notWeb } from '../../src/js/utils/environment';
import { MOCK_DSN } from '../mockDsn';

describe('Integration execution order', () => {
  describe('mobile hermes', () => {
    beforeEach(() => {
      (notWeb as jest.Mock).mockReturnValue(true);
      (isHermesEnabled as jest.Mock).mockReturnValue(true);
    });

    it('NativeLinkedErrors is before RewriteFrames', async () => {
      // NativeLinkedErrors has to process event before RewriteFrames
      // otherwise the linked errors stack trace frames won't be rewritten
      // DebugSymbolicator has to be called after RewriteFrames
      // otherwise symbolicated stack will be overwritten by the RewriteFrames
      // which will cause difference between Debug and Release builds where symbolication is done on Sentry Server

      const client = createTestClient();
      const { integrations } = client.getOptions();

      const nativeLinkedErrors = spyOnIntegrationById('NativeLinkedErrors', integrations);
      const rewriteFrames = spyOnIntegrationById('RewriteFrames', integrations);
      const debugSymbolicator = spyOnIntegrationById('DebugSymbolicator', integrations);

      client.init();

      client.captureException(new Error('test'));
      await client.flush();

      expect(nativeLinkedErrors.preprocessEvent).toHaveBeenCalledBefore(rewriteFrames.processEvent!);
      expect(rewriteFrames.processEvent!).toHaveBeenCalledBefore(debugSymbolicator.processEvent!);
    });
  });

  describe('web', () => {
    beforeEach(() => {
      (notWeb as jest.Mock).mockReturnValue(false);
      (isHermesEnabled as jest.Mock).mockReturnValue(false);
    });

    it('LinkedErrors is before RewriteFrames', async () => {
      // LinkedErrors has to process event before RewriteFrames
      // otherwise the linked errors stack trace frames won't be rewritten

      const client = createTestClient();
      const { integrations } = client.getOptions();

      const linkedErrors = spyOnIntegrationById('LinkedErrors', integrations);
      const rewriteFrames = spyOnIntegrationById('RewriteFrames', integrations);

      client.init();

      client.captureException(new Error('test'));
      await client.flush();

      expect(linkedErrors.preprocessEvent).toHaveBeenCalledBefore(rewriteFrames.processEvent!);
    });
  });
});

interface IntegrationSpy {
  name: string;
  setupOnce?: Integration['setupOnce'] & jest.Mock;
  preprocessEvent?: Integration['preprocessEvent'] & jest.Mock;
  processEvent?: Integration['processEvent'] & jest.Mock;
}

function spyOnIntegrationById(id: string, integrations: Integration[]): IntegrationSpy {
  const candidate = integrations?.find(integration => integration.name === id);
  if (!candidate) {
    throw new Error(`Integration ${id} not found`);
  }

  candidate.setupOnce && jest.spyOn(candidate, 'setupOnce');
  candidate.preprocessEvent && jest.spyOn(candidate, 'preprocessEvent');
  candidate.processEvent && jest.spyOn(candidate, 'processEvent');
  return candidate as IntegrationSpy;
}

function createTestClient(): ReactNativeClient {
  const clientOptions: ReactNativeClientOptions = {
    dsn: MOCK_DSN,
    transport: () => ({
      send: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(true),
    }),
    stackParser: defaultStackParser,
    integrations: [],
  };
  clientOptions.integrations = getDefaultIntegrations(clientOptions);

  return new ReactNativeClient(clientOptions);
}
