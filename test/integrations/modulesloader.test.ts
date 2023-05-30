import type { Event, EventHint } from '@sentry/types';

import { ModulesLoader } from '../../src/js/integrations';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Modules Loader', () => {
  let integration: ModulesLoader;

  beforeEach(() => {
    integration = new ModulesLoader();
  });

  it('integration event processor does not throw on native error', async () => {
    (NATIVE.fetchModules as jest.Mock).mockImplementation(() => {
      throw new Error('Test Error');
    });
    const mockEvent: Event = {
      modules: {
        eventModule: 'eventModuleVersion',
      },
    };
    const processedEvent = await executeIntegrationFor(mockEvent);

    expect(processedEvent).toEqual(mockEvent);
  });

  it('merges event modules with native modules', async () => {
    (NATIVE.fetchModules as jest.Mock).mockImplementation(() => ({
      nativeModules: 'nativeModuleVersion',
      duplicateModule: 'duplicateNativeModuleVersion',
    }));
    const mockEvent: Event = {
      modules: {
        eventModule: 'eventModuleVersion',
        duplicateModule: 'duplicateEventModuleVersion',
      },
    };
    const processedEvent = await executeIntegrationFor(mockEvent);

    expect(processedEvent?.modules).toEqual({
      eventModule: 'eventModuleVersion',
      nativeModules: 'nativeModuleVersion',
      duplicateModule: 'duplicateEventModuleVersion',
    });
  });

  function executeIntegrationFor(mockedEvent: Event, mockedHint: EventHint = {}): Promise<Event | null> {
    return new Promise((resolve, reject) => {
      integration.setupOnce(async eventProcessor => {
        try {
          const processedEvent = await eventProcessor(mockedEvent, mockedHint);
          resolve(processedEvent);
        } catch (e) {
          reject(e);
        }
      });
    });
  }
});
