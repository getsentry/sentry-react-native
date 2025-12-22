import { describe, it, beforeAll, expect, afterAll } from '@jest/globals';
import { Envelope, EventItem } from '@sentry/core';

import {
  createSentryServer,
  containingEvent,
} from '../../utils/mockedSentryServer';
import { getItemOfTypeFrom } from '../../utils/event';
import { maestro } from '../../utils/maestro';

describe('Capture app start crash', () => {
  let sentryServer = createSentryServer();

  let envelope: Envelope;

  beforeAll(async () => {
    await sentryServer.start();

    const envelopePromise = sentryServer.waitForEnvelope(containingEvent);

    await maestro('tests/captureAppStartCrash/captureAppStartCrash.test.ios.manual.yml');

    envelope = await envelopePromise;
  });

  afterAll(async () => {
    await sentryServer.close();
  });

  it('envelope contains sdk metadata', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item).toEqual([
      {
        length: expect.any(Number),
        type: 'event',
      },
      expect.objectContaining({
        platform: 'cocoa',
        sdk: {
          features: ['experimentalViewRenderer', 'dataSwizzling'],
          integrations: [
            'SessionReplay',
            // FIXME: Why are these not included?
            // 'WatchdogTerminationTracking',
            // 'Screenshot',
            // 'Crash',
            // 'ANRTracking',
            // 'ViewHierarchy',
            // 'AutoBreadcrumbTracking',
            // 'AutoSessionTracking',
            // 'NetworkTracking',
            // 'AppStartTracking',
            // 'FramesTracking',
          ],
          name: 'sentry.cocoa.react-native',
          packages: [
            {
              name: 'cocoapods:getsentry/sentry.cocoa.react-native',
              version: expect.any(String),
            },
            {
              name: 'npm:@sentry/react-native',
              version: expect.any(String),
            },
          ],
          version: expect.any(String),
        },
        tags: {
          'event.environment': 'native',
          'event.origin': 'ios',
        },
      }),
    ]);
  });

  it('envelope contains the expected exception', async () => {
    const item = getItemOfTypeFrom<EventItem>(envelope, 'event');

    expect(item).toEqual([
      {
        length: expect.any(Number),
        type: 'event',
      },
      expect.objectContaining({
        exception: {
          values: expect.arrayContaining([
            expect.objectContaining({
              mechanism: expect.objectContaining({
                handled: false,
                meta: {
                  mach_exception: {
                    code: 0,
                    exception: 10,
                    name: 'EXC_CRASH',
                    subcode: 0,
                  },
                  signal: {
                    code: 0,
                    name: 'SIGABRT',
                    number: 6,
                  },
                },
                type: 'nsexception',
              }),
              stacktrace: expect.objectContaining({
                frames: expect.any(Array),
              }),
              type: 'CrashOnStart',
              value: 'This was intentional test crash before JS started.',
            }),
          ]),
        },
      }),
    ]);
  });
});
