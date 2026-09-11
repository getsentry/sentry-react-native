import { describe, test } from '@jest/globals';
import { debug } from '@sentry/core';
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

  describe('pause/resume no-op on Web', () => {
    const mockUpstreamIntegration = (): void => {
      spyOn(environment, 'notWeb').mockReturnValue(false);
      spyOn(SentryReact, 'replayIntegration').mockReturnValue({
        name: 'Replay',
      } as ReturnType<typeof SentryReact.replayIntegration>);
    };

    test('pause() is a no-op that logs', () => {
      mockUpstreamIntegration();
      const debugLog = spyOn(debug, 'log').mockImplementation(() => {});

      const integration = browserReplayIntegration();
      expect(() => integration.pause()).not.toThrow();
      expect(debugLog).toHaveBeenCalledWith(expect.stringContaining('`pause()` is not supported on Web'));
    });

    test('resume() is a no-op that logs', () => {
      mockUpstreamIntegration();
      const debugLog = spyOn(debug, 'log').mockImplementation(() => {});

      const integration = browserReplayIntegration();
      expect(() => integration.resume()).not.toThrow();
      expect(debugLog).toHaveBeenCalledWith(expect.stringContaining('`resume()` is not supported on Web'));
    });
  });
});
