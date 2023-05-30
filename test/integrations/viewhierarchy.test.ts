import type { Event, EventHint } from '@sentry/types';

import { ViewHierarchy } from '../../src/js/integrations/viewhierarchy';
import { NATIVE } from '../../src/js/wrapper';

jest.mock('../../src/js/wrapper');

describe('ViewHierarchy', () => {
  let integration: ViewHierarchy;
  let mockEvent: Event;

  beforeEach(() => {
    integration = new ViewHierarchy();
    mockEvent = {
      exception: {
        values: [
          {
            value: 'Mock Error Event',
          },
        ],
      },
    };
  });

  it('integration event processor does not throw on native error', async () => {
    (NATIVE.fetchViewHierarchy as jest.Mock).mockImplementation(() => {
      throw new Error('Test Error');
    });
    const mockHint: EventHint = {};
    await executeIntegrationFor(mockEvent, mockHint);
    expect(mockHint).toEqual({});
  });

  it('returns unchanged event', async () => {
    (NATIVE.fetchViewHierarchy as jest.Mock).mockImplementation(<typeof NATIVE.fetchViewHierarchy>(
      (() => Promise.resolve(new Uint8Array([])))
    ));
    await executeIntegrationFor(mockEvent);

    expect(mockEvent).toEqual({
      exception: {
        values: [
          {
            value: 'Mock Error Event',
          },
        ],
      },
    });
  });

  it('adds view hierarchy attachment in event hint', async () => {
    (NATIVE.fetchViewHierarchy as jest.Mock).mockImplementation(<typeof NATIVE.fetchViewHierarchy>(
      (() => Promise.resolve(new Uint8Array([1, 2, 3])))
    ));
    const mockHint: EventHint = {};
    await executeIntegrationFor(mockEvent, mockHint);

    expect(mockHint).toEqual(<EventHint>{
      attachments: [
        {
          filename: 'view-hierarchy.json',
          contentType: 'application/json',
          attachmentType: 'event.view_hierarchy',
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    });
  });

  it('does not modify existing event hint attachments', async () => {
    (NATIVE.fetchViewHierarchy as jest.Mock).mockImplementation(<typeof NATIVE.fetchViewHierarchy>(
      (() => Promise.resolve(new Uint8Array([1, 2, 3])))
    ));
    const mockHint: EventHint = {
      attachments: [
        {
          filename: 'test-attachment.txt',
          contentType: 'text/plain',
          data: new Uint8Array([4, 5, 6]),
        },
      ],
    };
    await executeIntegrationFor(mockEvent, mockHint);

    expect(mockHint).toEqual(<EventHint>{
      attachments: [
        {
          filename: 'view-hierarchy.json',
          contentType: 'application/json',
          attachmentType: 'event.view_hierarchy',
          data: new Uint8Array([1, 2, 3]),
        },
        {
          filename: 'test-attachment.txt',
          contentType: 'text/plain',
          data: new Uint8Array([4, 5, 6]),
        },
      ],
    });
  });

  it('does not create empty view hierarchy attachment in event hint', async () => {
    (NATIVE.fetchViewHierarchy as jest.Mock).mockImplementation(<typeof NATIVE.fetchViewHierarchy>(
      (() => Promise.resolve(null))
    ));
    const mockHint: EventHint = {};
    await executeIntegrationFor(mockEvent, mockHint);

    expect(mockHint).toEqual({});
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
