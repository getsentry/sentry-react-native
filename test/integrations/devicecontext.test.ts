import { Hub } from '@sentry/core';
import { Event, SeverityLevel } from '@sentry/types';

import { NativeDeviceContextsResponse } from '../../src/js/definitions';
import { DeviceContext } from '../../src/js/integrations';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('Device Context Integration', () => {
  let integration: DeviceContext;

  const mockGetCurrentHub = () => ({
    getIntegration: () => integration,
  } as unknown as Hub);

  beforeEach(() => {
    integration = new DeviceContext();
  });

  it('add native user', async () => {
    (await executeIntegrationWith({
      nativeContexts: { user: { id: 'native-user' } },
    })).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event user', async () => {
    (await executeIntegrationWith({
      nativeContexts: { user: { id: 'native-user' } },
      mockEvent: { user: { id: 'event-user' } },
    })).expectEvent.toStrictEqualMockEvent();
  });

  it('merge event and native contexts', async () => {
    const { processedEvent } = await executeIntegrationWith({
      nativeContexts: { context: { duplicate: { context: 'native-value' }, native: { context: 'value' } } },
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
    const { processedEvent } = await executeIntegrationWith({
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
    const { processedEvent } = await executeIntegrationWith({
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
    const { processedEvent } = await executeIntegrationWith({
      nativeContexts: { fingerprint: ['duplicate-fingerprint', 'native-fingerprint'] },
      mockEvent: { fingerprint: ['duplicate-fingerprint', 'event-fingerprint'] },
    });
    expect(processedEvent).toStrictEqual({
      fingerprint: ['duplicate-fingerprint', 'event-fingerprint', 'native-fingerprint'],
    });
  });

  it('add native level', async () => {
    (await executeIntegrationWith({
      nativeContexts: { level: <SeverityLevel>'fatal' },
    })).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event level', async () => {
    (await executeIntegrationWith({
      nativeContexts: { level: 'native-level' },
      mockEvent: { level: 'info' },
    })).expectEvent.toStrictEqualMockEvent();
  });

  it('add native environment', async () => {
    (await executeIntegrationWith({
      nativeContexts: { environment: 'native-environment' },
    })).expectEvent.toStrictEqualToNativeContexts();
  });

  it('do not overwrite event environment', async () => {
    (await executeIntegrationWith({
      nativeContexts: { environment: 'native-environment' },
      mockEvent: { environment: 'event-environment' },
    })).expectEvent.toStrictEqualMockEvent();
  });

  it('merge breadcrumbs', async () => {
    const { processedEvent } = await executeIntegrationWith({
      nativeContexts: { breadcrumbs: [{ message: 'duplicate-breadcrumb' }, { message: 'native-breadcrumb' }] },
      mockEvent: { breadcrumbs: [{ message: 'duplicate-breadcrumb' }, { message: 'event-breadcrumb' }] },
    });
    expect(processedEvent).toStrictEqual({
      breadcrumbs: [
        { message: 'duplicate-breadcrumb' },
        { message: 'event-breadcrumb' },
        { message: 'native-breadcrumb' },
      ],
    });
  });

  it('asc oder breadcrumbs by timestamp', async () => {
    const { processedEvent } = await executeIntegrationWith({
      nativeContexts: {
        breadcrumbs: [
          { message: 'breadcrumb-1' },
          { message: 'breadcrumb-2', timestamp: '2023-10-01T11:00:00.000Z' },
          { message: 'breadcrumb-0' },
        ]
      },
      mockEvent: {
        breadcrumbs: [
          { message: 'breadcrumb-4', timestamp: Date.parse('2025-10-01T11:00:00.000Z') },
          { message: 'breadcrumb-3', timestamp: Date.parse('2024-10-01T11:00:00.000Z') },
          { message: 'breadcrumb-5' },
        ]
      },
    });

    expect(processedEvent).toStrictEqual({
      breadcrumbs: [
        { message: 'breadcrumb-5' },
        { message: 'breadcrumb-1' },
        { message: 'breadcrumb-0' },
        { message: 'breadcrumb-2', timestamp: Date.parse('2023-10-01T11:00:00.000Z') },
        { message: 'breadcrumb-3', timestamp: Date.parse('2024-10-01T11:00:00.000Z') },
        { message: 'breadcrumb-4', timestamp: Date.parse('2025-10-01T11:00:00.000Z') },
      ],
    });
  });

  async function executeIntegrationWith({ nativeContexts, mockEvent }: {
    nativeContexts: Record<string, unknown>;
    mockEvent?: Event;
  }): Promise<{
    processedEvent: Event | null;
    expectEvent: {
      toStrictEqualToNativeContexts: () => void;
      toStrictEqualMockEvent: () => void;
    };
  }> {
    (NATIVE.fetchNativeDeviceContexts as jest.MockedFunction<typeof NATIVE.fetchNativeDeviceContexts>)
      .mockImplementation(
        () => Promise.resolve(nativeContexts as NativeDeviceContextsResponse),
      );
    const originalNativeContexts = { ...nativeContexts };
    const originalMockEvent = { ...mockEvent };
    const processedEvent = await executeIntegrationFor(mockEvent ?? {});
    return {
      processedEvent,
      expectEvent: {
        toStrictEqualToNativeContexts: () => expect(processedEvent).toStrictEqual(originalNativeContexts),
        toStrictEqualMockEvent: () => expect(processedEvent).toStrictEqual(originalMockEvent),
      },
    };
  }

  function executeIntegrationFor(mockedEvent: Event): Promise<Event | null> {
    return new Promise((resolve, reject) => {
      integration.setupOnce(
        async (eventProcessor) => {
          try {
            const processedEvent = await eventProcessor(mockedEvent, {});
            resolve(processedEvent);
          } catch (e) {
            reject(e);
          }
        },
        mockGetCurrentHub,
      );
    });
  }
});
