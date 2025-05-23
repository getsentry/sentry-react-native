import { describe, test, } from '@jest/globals';
import * as SentryReact from '@sentry/react';
import { spyOn } from 'jest-mock';

import { browserReplayIntegration } from '../../src/js/replay/browserReplay';
import * as environment from '../../src/js/utils/environment';

describe('Browser Replay', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should not call replayIntegration if not web', () => {
    spyOn(environment, 'notWeb').mockReturnValue(true);
    spyOn(SentryReact, 'replayIntegration').mockImplementation(() => {
      throw new Error('replayIntegration should not be called');
    });

    const integration = browserReplayIntegration();

    expect(integration).toBeDefined();
    expect(SentryReact.replayIntegration).not.toHaveBeenCalled();
  });
});
