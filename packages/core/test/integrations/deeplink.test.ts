import { addBreadcrumb, getClient } from '@sentry/core';

import { deeplinkIntegration } from '../../src/js/integrations/deeplink';

const mockGetInitialURL = jest.fn<Promise<string | null>, []>();
const mockAddEventListener = jest.fn<{ remove: () => void }, [string, (event: { url: string }) => void]>();

jest.mock('react-native', () => ({
  Linking: {
    getInitialURL: (...args: unknown[]) => mockGetInitialURL(...args),
    addEventListener: (...args: Parameters<typeof mockAddEventListener>) => mockAddEventListener(...args),
  },
}));

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    addBreadcrumb: jest.fn(),
    getClient: jest.fn(),
  };
});

const mockAddBreadcrumb = addBreadcrumb as jest.Mock;
const mockGetClient = getClient as jest.Mock;

describe('deeplinkIntegration', () => {
  const mockClient = { on: jest.fn() } as unknown as Parameters<
    NonNullable<ReturnType<typeof deeplinkIntegration>['setup']>
  >[0];

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInitialURL.mockResolvedValue(null);
    mockAddEventListener.mockReturnValue({ remove: jest.fn() });
    mockGetClient.mockReturnValue({
      getOptions: () => ({ sendDefaultPii: false }),
    });
  });

  describe('cold start (getInitialURL)', () => {
    it('adds a breadcrumb when app opened via deep link', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://profile/123?token=secret');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve(); // flush microtasks

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'deeplink',
          type: 'navigation',
        }),
      );
    });

    it('strips query params and ID segments when sendDefaultPii is false', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://profile/123?token=secret');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://profile/<id>',
          data: { url: 'myapp://profile/<id>' },
        }),
      );
    });

    it('keeps full URL when sendDefaultPii is true', async () => {
      mockGetClient.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
      });
      mockGetInitialURL.mockResolvedValue('myapp://profile/123?token=secret');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://profile/123?token=secret',
          data: { url: 'myapp://profile/123?token=secret' },
        }),
      );
    });

    it('does not add a breadcrumb when getInitialURL returns null', async () => {
      mockGetInitialURL.mockResolvedValue(null);

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });

    it('does not throw when getInitialURL rejects', async () => {
      mockGetInitialURL.mockRejectedValue(new Error('Linking error'));

      const integration = deeplinkIntegration();
      expect(() => integration.setup?.(mockClient)).not.toThrow();

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockAddBreadcrumb).not.toHaveBeenCalled();
    });
  });

  describe('warm open (url event)', () => {
    it('adds a breadcrumb when a url event is received', () => {
      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      const handler = mockAddEventListener.mock.calls[0]?.[1];
      handler?.({ url: 'myapp://notifications/456' });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'deeplink',
          type: 'navigation',
        }),
      );
    });

    it('strips query params and ID segments on url event when sendDefaultPii is false', () => {
      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      const handler = mockAddEventListener.mock.calls[0]?.[1];
      handler?.({ url: 'myapp://notifications/456?ref=push' });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://notifications/<id>',
          data: { url: 'myapp://notifications/<id>' },
        }),
      );
    });

    it('keeps full URL on url event when sendDefaultPii is true', () => {
      mockGetClient.mockReturnValue({
        getOptions: () => ({ sendDefaultPii: true }),
      });

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      const handler = mockAddEventListener.mock.calls[0]?.[1];
      handler?.({ url: 'myapp://notifications/456?ref=push' });

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://notifications/456?ref=push',
          data: { url: 'myapp://notifications/456?ref=push' },
        }),
      );
    });

    it('registers the url event listener on setup', () => {
      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      expect(mockAddEventListener).toHaveBeenCalledWith('url', expect.any(Function));
    });
  });

  describe('subscription cleanup', () => {
    it('removes the url event listener when the client closes', () => {
      const mockRemove = jest.fn();
      mockAddEventListener.mockReturnValue({ remove: mockRemove });

      const closeHandlers: (() => void)[] = [];
      const mockClient = {
        on: (event: string, handler: () => void) => {
          if (event === 'close') {
            closeHandlers.push(handler);
          }
        },
      };

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient as Parameters<NonNullable<typeof integration.setup>>[0]);

      expect(mockRemove).not.toHaveBeenCalled();

      closeHandlers.forEach(h => h());

      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe('repeated setup', () => {
    it('removes previous subscription when setup is called again', () => {
      const mockRemove1 = jest.fn();
      const mockRemove2 = jest.fn();
      mockAddEventListener.mockReturnValueOnce({ remove: mockRemove1 }).mockReturnValueOnce({ remove: mockRemove2 });

      const closeHandlers: (() => void)[] = [];
      const client = {
        on: (event: string, handler: () => void) => {
          if (event === 'close') {
            closeHandlers.push(handler);
          }
        },
      } as unknown as Parameters<NonNullable<ReturnType<typeof deeplinkIntegration>['setup']>>[0];

      const integration = deeplinkIntegration();

      // First setup
      integration.setup?.(client);
      expect(mockRemove1).not.toHaveBeenCalled();

      // Second setup — should remove previous subscription
      integration.setup?.(client);
      expect(mockRemove1).toHaveBeenCalledTimes(1);
      expect(mockRemove2).not.toHaveBeenCalled();
    });
  });

  describe('URL sanitization', () => {
    it('does not alter non-ID path segments', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://settings/profile');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://settings/profile',
        }),
      );
    });

    it('strips URL fragments when sendDefaultPii is false', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://page#user=john');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://page',
          data: { url: 'myapp://page' },
        }),
      );
    });

    it('strips both query string and fragment when sendDefaultPii is false', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://page/123?token=secret#section');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://page/<id>',
          data: { url: 'myapp://page/<id>' },
        }),
      );
    });

    it('does not replace hostname that resembles a hex string', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://deadbeef/profile');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      expect(mockAddBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'myapp://deadbeef/profile',
          data: { url: 'myapp://deadbeef/profile' },
        }),
      );
    });

    it('replaces UUID-like segments', async () => {
      mockGetInitialURL.mockResolvedValue('myapp://order/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const integration = deeplinkIntegration();
      integration.setup?.(mockClient);

      await Promise.resolve();

      const call = mockAddBreadcrumb.mock.calls[0]?.[0];
      expect(call?.message).not.toContain('a1b2c3d4');
    });
  });
});
