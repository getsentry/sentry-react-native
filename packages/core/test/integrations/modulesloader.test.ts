import type { Client, Event, EventHint } from '@sentry/types';

import { modulesLoaderIntegration } from '../../src/js/integrations/modulesloader';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Modules Loader', () => {
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

  function executeIntegrationFor(
    mockedEvent: Event,
    mockedHint: EventHint = {},
  ): Event | null | PromiseLike<Event | null> {
    const integration = modulesLoaderIntegration();
    return integration.processEvent!(mockedEvent, mockedHint, {} as Client);
  }
});
