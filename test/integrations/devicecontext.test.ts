import type { Client, Event, EventHint, SeverityLevel } from '@sentry/types';

import { deviceContextIntegration } from '../../src/js/integrations/devicecontext';
import type { NativeDeviceContextsResponse } from '../../src/js/NativeRNSentry';
import { NATIVE } from '../../src/js/wrapper';

let mockCurrentAppState: string = 'unknown';

jest.mock('../../src/js/wrapper');
jest.mock('react-native', () => ({
  AppState: new Proxy({}, { get: () => mockCurrentAppState }),
  NativeModules: {},
  Platform: {},
}));

describe('Device Context Integration', () => {
  it('add native user', async () => {
    (
      await processEventWith({
        nativeContexts: { user: { id: 'native-user' } },
      })
    ).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event user', async () => {
    (
      await processEventWith({
        nativeContexts: { user: { id: 'native-user' } },
        mockEvent: { user: { id: 'event-user' } },
      })
    ).expectEvent.toStrictEqualMockEvent();
  });

  it('do not overwrite event app context', async () => {
    (
      await processEventWith({
        nativeContexts: { app: { view_names: ['native view'] } },
        mockEvent: { contexts: { app: { view_names: ['Home'] } } },
      })
    ).expectEvent.toStrictEqualMockEvent();
  });

  it('merge event context app', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { app: { native: 'value' } } },
      mockEvent: { contexts: { app: { event_app: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        app: {
          event_app: 'value',
          native: 'value',
        },
      },
    });
  });

  it('merge event context app even when event app doesnt exist', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { app: { native: 'value' } } },
      mockEvent: { contexts: { keyContext: { key: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        keyContext: {
          key: 'value',
        },
        app: {
          native: 'value',
        },
      },
    });
  });

  it('merge event and native contexts', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { duplicate: { context: 'native-value' }, native: { context: 'value' } } },
      mockEvent: { contexts: { duplicate: { context: 'event-value' }, event: { context: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        duplicate: { context: 'event-value' },
        native: { context: 'value' },
        event: { context: 'value' },
      },
    });
  });

  it('merge native tags', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { tags: { duplicate: 'native-tag', native: 'tag' } },
      mockEvent: { tags: { duplicate: 'event-tag', event: 'tag' } },
    });
    expect(processedEvent).toStrictEqual({
      tags: {
        duplicate: 'event-tag',
        native: 'tag',
        event: 'tag',
      },
    });
  });

  it('merge native extra', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { extra: { duplicate: 'native-extra', native: 'extra' } },
      mockEvent: { extra: { duplicate: 'event-extra', event: 'extra' } },
    });
    expect(processedEvent).toStrictEqual({
      extra: {
        duplicate: 'event-extra',
        native: 'extra',
        event: 'extra',
      },
    });
  });

  it('merge fingerprints', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { fingerprint: ['duplicate-fingerprint', 'native-fingerprint'] },
      mockEvent: { fingerprint: ['duplicate-fingerprint', 'event-fingerprint'] },
    });
    expect(processedEvent).toStrictEqual({
      fingerprint: ['duplicate-fingerprint', 'event-fingerprint', 'native-fingerprint'],
    });
  });

  it('add native level', async () => {
    (
      await processEventWith({
        nativeContexts: { level: <SeverityLevel>'fatal' },
      })
    ).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event level', async () => {
    (
      await processEventWith({
        nativeContexts: { level: 'native-level' },
        mockEvent: { level: 'info' },
      })
    ).expectEvent.toStrictEqualMockEvent();
  });

  it('add native environment', async () => {
    (
      await processEventWith({
        nativeContexts: { environment: 'native-environment' },
      })
    ).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event environment', async () => {
    (
      await processEventWith({
        nativeContexts: { environment: 'native-environment' },
        mockEvent: { environment: 'event-environment' },
      })
    ).expectEvent.toStrictEqualMockEvent();
  });

  it('use only native breadcrumbs', async () => {
    const { processedEvent } = await processEventWith({
      nativeContexts: { breadcrumbs: [{ message: 'duplicate-breadcrumb' }, { message: 'native-breadcrumb' }] },
      mockEvent: { breadcrumbs: [{ message: 'duplicate-breadcrumb' }, { message: 'event-breadcrumb' }] },
    });
    expect(processedEvent).toStrictEqual({
      breadcrumbs: [{ message: 'duplicate-breadcrumb' }, { message: 'native-breadcrumb' }],
    });
  });

  it('adds in_foreground false to native app contexts', async () => {
    mockCurrentAppState = 'background';
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { app: { native: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        app: {
          native: 'value',
          in_foreground: false,
        },
      },
    });
  });

  it('adds in_foreground to native app contexts', async () => {
    mockCurrentAppState = 'active';
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { app: { native: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        app: {
          native: 'value',
          in_foreground: true,
        },
      },
    });
  });

  it('do not add in_foreground if unknown', async () => {
    mockCurrentAppState = 'unknown';
    const { processedEvent } = await processEventWith({
      nativeContexts: { contexts: { app: { native: 'value' } } },
    });
    expect(processedEvent).toStrictEqual({
      contexts: {
        app: {
          native: 'value',
        },
      },
    });
  });
});

async function processEventWith({
  nativeContexts,
  mockEvent,
}: {
  nativeContexts: Record<string, unknown>;
  mockEvent?: Event;
}): Promise<{
  processedEvent: Event | null;
  expectEvent: {
    toStrictEqualToNativeContexts: () => void;
    toStrictEqualMockEvent: () => void;
  };
}> {
  (NATIVE.fetchNativeDeviceContexts as jest.MockedFunction<typeof NATIVE.fetchNativeDeviceContexts>).mockImplementation(
    () => Promise.resolve(nativeContexts as NativeDeviceContextsResponse),
  );
  const originalNativeContexts = { ...nativeContexts };
  const originalMockEvent = { ...mockEvent };
  const processedEvent = await processEvent(mockEvent ?? {});
  return {
    processedEvent,
    expectEvent: {
      toStrictEqualToNativeContexts: () => expect(processedEvent).toStrictEqual(originalNativeContexts),
      toStrictEqualMockEvent: () => expect(processedEvent).toStrictEqual(originalMockEvent),
    },
  };
}

function processEvent(mockedEvent: Event): Event | null | PromiseLike<Event | null> {
  return deviceContextIntegration().processEvent!(mockedEvent, {} as EventHint, {} as Client);
}
