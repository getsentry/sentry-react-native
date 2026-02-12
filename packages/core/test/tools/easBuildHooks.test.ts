import {
  captureEASBuildComplete,
  captureEASBuildError,
  captureEASBuildSuccess,
  getEASBuildEnv,
  isEASBuild,
} from '../../src/js/tools/easBuildHooks';

// Mock fetch
const mockFetch = jest.fn();

// @ts-expect-error - Mocking global fetch
global.fetch = mockFetch;

describe('EAS Build Hooks', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
    // Default successful fetch response
    mockFetch.mockResolvedValue({
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue(null),
      },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isEASBuild', () => {
    it('returns true when EAS_BUILD is "true"', () => {
      process.env.EAS_BUILD = 'true';
      expect(isEASBuild()).toBe(true);
    });

    it('returns false when EAS_BUILD is not set', () => {
      delete process.env.EAS_BUILD;
      expect(isEASBuild()).toBe(false);
    });

    it('returns false when EAS_BUILD is "false"', () => {
      process.env.EAS_BUILD = 'false';
      expect(isEASBuild()).toBe(false);
    });

    it('returns false when EAS_BUILD is empty', () => {
      process.env.EAS_BUILD = '';
      expect(isEASBuild()).toBe(false);
    });
  });

  describe('getEASBuildEnv', () => {
    it('returns all EAS build environment variables', () => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_ID = 'build-123';
      process.env.EAS_BUILD_PLATFORM = 'ios';
      process.env.EAS_BUILD_PROFILE = 'production';
      process.env.EAS_BUILD_PROJECT_ID = 'project-456';
      process.env.EAS_BUILD_GIT_COMMIT_HASH = 'abc123';
      process.env.EAS_BUILD_RUN_FROM_CI = 'true';
      process.env.EAS_BUILD_STATUS = 'finished';
      process.env.EAS_BUILD_APP_VERSION = '1.0.0';
      process.env.EAS_BUILD_APP_BUILD_VERSION = '42';
      process.env.EAS_BUILD_USERNAME = 'testuser';
      process.env.EAS_BUILD_WORKINGDIR = '/build/workdir';

      const env = getEASBuildEnv();

      expect(env).toEqual({
        EAS_BUILD: 'true',
        EAS_BUILD_ID: 'build-123',
        EAS_BUILD_PLATFORM: 'ios',
        EAS_BUILD_PROFILE: 'production',
        EAS_BUILD_PROJECT_ID: 'project-456',
        EAS_BUILD_GIT_COMMIT_HASH: 'abc123',
        EAS_BUILD_RUN_FROM_CI: 'true',
        EAS_BUILD_STATUS: 'finished',
        EAS_BUILD_APP_VERSION: '1.0.0',
        EAS_BUILD_APP_BUILD_VERSION: '42',
        EAS_BUILD_USERNAME: 'testuser',
        EAS_BUILD_WORKINGDIR: '/build/workdir',
      });
    });

    it('returns undefined for unset variables', () => {
      delete process.env.EAS_BUILD;
      delete process.env.EAS_BUILD_ID;

      const env = getEASBuildEnv();

      expect(env.EAS_BUILD).toBeUndefined();
      expect(env.EAS_BUILD_ID).toBeUndefined();
    });
  });

  describe('captureEASBuildError', () => {
    beforeEach(() => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_PLATFORM = 'android';
      process.env.EAS_BUILD_PROFILE = 'preview';
      process.env.SENTRY_DSN = 'https://key@sentry.io/123';
    });

    it('does not capture when DSN is not set', async () => {
      delete process.env.SENTRY_DSN;

      await captureEASBuildError();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not capture when not in EAS build environment', async () => {
      process.env.EAS_BUILD = 'false';

      await captureEASBuildError();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends error event to Sentry', async () => {
      await captureEASBuildError();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sentry.io/api/123/envelope'),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-sentry-envelope',
          },
          body: expect.stringContaining('EASBuildError'),
        }),
      );
    });

    it('includes EAS build tags in the event', async () => {
      process.env.EAS_BUILD_ID = 'build-xyz';
      process.env.EAS_BUILD_PROJECT_ID = 'proj-abc';

      await captureEASBuildError();

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"eas.platform":"android"');
      expect(body).toContain('"eas.profile":"preview"');
      expect(body).toContain('"eas.build_id":"build-xyz"');
      expect(body).toContain('"eas.hook":"on-error"');
    });

    it('uses custom error message when provided', async () => {
      await captureEASBuildError({ errorMessage: 'Custom build failure' });

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('Custom build failure');
    });

    it('uses DSN from options if provided', async () => {
      delete process.env.SENTRY_DSN;

      await captureEASBuildError({ dsn: 'https://custom@other.sentry.io/456' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('other.sentry.io/api/456/envelope'),
        expect.anything(),
      );
    });

    it('includes fingerprint for grouping', async () => {
      await captureEASBuildError();

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"fingerprint":["eas-build-error","android","preview"]');
    });

    it('includes custom tags from options', async () => {
      await captureEASBuildError({
        tags: {
          'custom.tag': 'custom-value',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"custom.tag":"custom-value"');
    });

    it('handles invalid DSN gracefully', async () => {
      process.env.SENTRY_DSN = 'invalid-dsn';

      await captureEASBuildError();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('captureEASBuildSuccess', () => {
    beforeEach(() => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_PLATFORM = 'ios';
      process.env.EAS_BUILD_PROFILE = 'production';
      process.env.SENTRY_DSN = 'https://key@sentry.io/123';
    });

    it('does not capture by default (captureSuccessfulBuilds is false)', async () => {
      await captureEASBuildSuccess();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('captures success when captureSuccessfulBuilds is true', async () => {
      await captureEASBuildSuccess({ captureSuccessfulBuilds: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"level":"info"');
      expect(body).toContain('EAS Build Succeeded');
      expect(body).toContain('"eas.hook":"on-success"');
    });

    it('uses custom success message when provided', async () => {
      await captureEASBuildSuccess({
        captureSuccessfulBuilds: true,
        successMessage: 'Build completed successfully!',
      });

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('Build completed successfully!');
    });

    it('does not capture when DSN is not set', async () => {
      delete process.env.SENTRY_DSN;

      await captureEASBuildSuccess({ captureSuccessfulBuilds: true });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('captureEASBuildComplete', () => {
    beforeEach(() => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_PLATFORM = 'android';
      process.env.EAS_BUILD_PROFILE = 'development';
      process.env.SENTRY_DSN = 'https://key@sentry.io/123';
    });

    it('captures error when EAS_BUILD_STATUS is "errored"', async () => {
      process.env.EAS_BUILD_STATUS = 'errored';

      await captureEASBuildComplete();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"level":"error"');
      expect(body).toContain('EASBuildError');
    });

    it('captures success when EAS_BUILD_STATUS is "finished" and captureSuccessfulBuilds is true', async () => {
      process.env.EAS_BUILD_STATUS = 'finished';

      await captureEASBuildComplete({ captureSuccessfulBuilds: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body;

      expect(body).toContain('"level":"info"');
      expect(body).toContain('EAS Build Succeeded');
    });

    it('does not capture success when EAS_BUILD_STATUS is "finished" but captureSuccessfulBuilds is false', async () => {
      process.env.EAS_BUILD_STATUS = 'finished';

      await captureEASBuildComplete({ captureSuccessfulBuilds: false });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not capture anything when status is unknown', async () => {
      process.env.EAS_BUILD_STATUS = 'unknown';

      await captureEASBuildComplete();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not capture when status is undefined and captureSuccessfulBuilds is false', async () => {
      delete process.env.EAS_BUILD_STATUS;

      await captureEASBuildComplete();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('envelope format', () => {
    beforeEach(() => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_PLATFORM = 'ios';
      process.env.EAS_BUILD_PROFILE = 'staging';
      process.env.SENTRY_DSN = 'https://publickey@sentry.io/123';
    });

    it('creates valid envelope with correct headers', async () => {
      await captureEASBuildError();

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body as string;
      const lines = body.split('\n');

      // Envelope should have 3 lines: envelope header, item header, item payload
      expect(lines.length).toBe(3);

      // Parse and verify envelope header
      const envelopeHeader = JSON.parse(lines[0]);
      expect(envelopeHeader).toHaveProperty('event_id');
      expect(envelopeHeader).toHaveProperty('sent_at');
      expect(envelopeHeader.dsn).toContain('sentry.io/123');

      // Parse and verify item header
      const itemHeader = JSON.parse(lines[1]);
      expect(itemHeader.type).toBe('event');
      expect(itemHeader.content_type).toBe('application/json');

      // Parse and verify event payload
      const event = JSON.parse(lines[2]);
      expect(event.platform).toBe('node');
      expect(event.environment).toBe('eas-build');
      expect(event.level).toBe('error');
    });

    it('includes EAS build context in the event', async () => {
      process.env.EAS_BUILD_ID = 'build-context-test';
      process.env.EAS_BUILD_GIT_COMMIT_HASH = 'commit123';
      process.env.EAS_BUILD_RUN_FROM_CI = 'true';

      await captureEASBuildError();

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body as string;
      const lines = body.split('\n');
      const event = JSON.parse(lines[2]);

      expect(event.contexts.eas_build).toEqual(
        expect.objectContaining({
          build_id: 'build-context-test',
          platform: 'ios',
          profile: 'staging',
          git_commit: 'commit123',
          from_ci: true,
        }),
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      process.env.EAS_BUILD = 'true';
      process.env.EAS_BUILD_PLATFORM = 'ios';
      process.env.SENTRY_DSN = 'https://key@sentry.io/123';
    });

    it('handles fetch failure gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(captureEASBuildError()).resolves.not.toThrow();
    });

    it('handles non-2xx response gracefully', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        headers: {
          get: jest.fn().mockReturnValue(null),
        },
      });

      // Should not throw
      await expect(captureEASBuildError()).resolves.not.toThrow();
    });
  });
});
