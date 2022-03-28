import { Event } from '@sentry/types';

import { SdkInfo } from '../../src/js/integrations';
import { NATIVE } from '../../src/js/wrapper';

const mockPackage = {
  name: 'sentry-cocoa',
  version: '0.0.1',
};

jest.mock('../../src/js/wrapper', () => {
  const actual = jest.requireActual('../../src/js/wrapper');

  return {
    NATIVE: {
      ...actual.NATIVE,
      platform: 'ios',
      fetchNativeSdkInfo: jest.fn(() => Promise.resolve(mockPackage)),
    },
  };
});

afterEach(() => {
  NATIVE.platform = 'ios';
});

describe('Sdk Info', () => {
  it('Adds native package and javascript platform to event on iOS', (done) => {
    const integration = new SdkInfo();

    const mockEvent: Event = {};

    integration.setupOnce(async (eventProcessor) => {
      try {
        const processedEvent = await eventProcessor(mockEvent);

        expect(processedEvent).toBeDefined();
        if (processedEvent) {
          expect(processedEvent.sdk).toBeDefined();
          if (processedEvent.sdk) {
            expect(processedEvent.sdk.packages).toBeDefined();
            if (processedEvent.sdk.packages) {
              expect(
                processedEvent.sdk.packages.some(
                  (pkg) =>
                    pkg.name === mockPackage.name &&
                    pkg.version === mockPackage.version
                )
              ).toBe(true);
            }
          }
          expect(processedEvent.platform === 'javascript');
        }

        done();
      } catch (e) {
        done(e);
      }
    });
  });

  it('Adds javascript platform but not native package on Android', (done) => {
    NATIVE.platform = 'android';
    const integration = new SdkInfo();

    const mockEvent: Event = {};

    integration.setupOnce(async (eventProcessor) => {
      try {
        const processedEvent = await eventProcessor(mockEvent);

        expect(processedEvent).toBeDefined();
        if (processedEvent) {
          expect(processedEvent.sdk).toBeDefined();
          if (processedEvent.sdk) {
            expect(processedEvent.sdk.packages).toBeDefined();
            if (processedEvent.sdk.packages) {
              expect(
                processedEvent.sdk.packages.some(
                  (pkg) =>
                    pkg.name === mockPackage.name &&
                    pkg.version === mockPackage.version
                )
              ).toBe(false);
            }
          }
          expect(processedEvent.platform === 'javascript');
        }

        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
