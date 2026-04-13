import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';

import { type ExpoImage, wrapExpoImage } from '../../src/js/tracing';
import { SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE } from '../../src/js/tracing/origin';

const mockStartInactiveSpan = jest.fn();

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: (...args: unknown[]) => mockStartInactiveSpan(...args),
  };
});

describe('wrapExpoImage', () => {
  let mockSpan: {
    setStatus: jest.Mock;
    end: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpan = {
      setStatus: jest.fn(),
      end: jest.fn(),
    };
    mockStartInactiveSpan.mockReturnValue(mockSpan);
  });

  it('returns the class unchanged if null or undefined', () => {
    expect(wrapExpoImage(null as unknown as ExpoImage)).toBeNull();
    expect(wrapExpoImage(undefined as unknown as ExpoImage)).toBeUndefined();
  });

  it('does not double-wrap the same class', () => {
    const mockPrefetch = jest.fn().mockResolvedValue(true);
    const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn().mockResolvedValue({}) } as unknown as ExpoImage;

    const wrapped1 = wrapExpoImage(imageClass);
    const wrapped2 = wrapExpoImage(wrapped1);

    expect(wrapped1).toBe(wrapped2);
  });

  describe('prefetch', () => {
    it('creates a span for single URL prefetch', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://example.com/image.png');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.prefetch',
        name: 'Image prefetch image.png',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
          'image.url_count': 1,
          'image.url': 'https://example.com/image.png',
        },
      });

      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image.png', undefined);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('creates a span for multiple URL prefetch', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      const urls = ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'];
      await imageClass.prefetch(urls);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.prefetch',
        name: 'Image prefetch 3 images',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
          'image.url_count': 3,
        },
      });
    });

    it('passes cache policy option through', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://example.com/image.png', 'memory-disk');

      expect(mockPrefetch).toHaveBeenCalledWith('https://example.com/image.png', 'memory-disk');
    });

    it('handles prefetch failure', async () => {
      const error = new Error('Network error');
      const mockPrefetch = jest.fn().mockRejectedValue(error);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);

      await expect(imageClass.prefetch('https://example.com/image.png')).rejects.toThrow('Network error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Network error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends span when prefetch throws synchronously', async () => {
      const error = new Error('Invalid argument');
      const mockPrefetch = jest.fn().mockImplementation(() => {
        throw error;
      });
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);

      expect(() => imageClass.prefetch('https://example.com/image.png')).toThrow('Invalid argument');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Invalid argument',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('marks span as error when prefetch resolves to false', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(false);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      const result = await imageClass.prefetch('https://example.com/missing.png');

      expect(result).toBe(false);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'prefetch_failed',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('handles URL without path correctly', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://example.com');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('Image prefetch'),
        }),
      );
    });

    it('handles non-URL string gracefully', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('not-a-url');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Image prefetch not-a-url',
        }),
      );
    });

    it('strips query string from URL in span name and attribute', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://cdn.example.com/images/photo.jpg?token=SECRET&size=large');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Image prefetch photo.jpg',
          attributes: expect.objectContaining({
            'image.url': 'https://cdn.example.com/images/photo.jpg',
          }),
        }),
      );
    });

    it('strips fragment from URL in span name and attribute', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://cdn.example.com/images/photo.jpg#section');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Image prefetch photo.jpg',
          attributes: expect.objectContaining({
            'image.url': 'https://cdn.example.com/images/photo.jpg',
          }),
        }),
      );
    });

    it('does not leak query string in span name or attributes', async () => {
      const mockPrefetch = jest.fn().mockResolvedValue(true);
      const imageClass = { prefetch: mockPrefetch, loadAsync: jest.fn() } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.prefetch('https://cdn.example.com/images/?token=SECRET');

      const call = mockStartInactiveSpan.mock.calls[0][0];
      expect(call.name).not.toContain('SECRET');
      expect(JSON.stringify(call.attributes)).not.toContain('SECRET');
    });
  });

  describe('loadAsync', () => {
    it('creates a span for loading by URL string', async () => {
      const mockResult = { width: 100, height: 100, scale: 1, mediaType: 'image/png' };
      const mockLoadAsync = jest.fn().mockResolvedValue(mockResult);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      const result = await imageClass.loadAsync('https://example.com/photo.jpg');

      expect(result).toBe(mockResult);
      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.load',
        name: 'Image load photo.jpg',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
          'image.url': 'https://example.com/photo.jpg',
        },
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('creates a span for loading by ImageSource object', async () => {
      const mockResult = { width: 200, height: 200, scale: 2, mediaType: 'image/jpeg' };
      const mockLoadAsync = jest.fn().mockResolvedValue(mockResult);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      const source = { uri: 'https://example.com/avatar.jpg', width: 200, height: 200 };
      await imageClass.loadAsync(source);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.load',
        name: 'Image load avatar.jpg',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
          'image.url': 'https://example.com/avatar.jpg',
        },
      });
    });

    it('creates a span for loading by module ID (number)', async () => {
      const mockResult = { width: 50, height: 50, scale: 1, mediaType: null };
      const mockLoadAsync = jest.fn().mockResolvedValue(mockResult);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.loadAsync(42);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.load',
        name: 'Image load asset #42',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
        },
      });
    });

    it('creates a span for ImageSource without uri', async () => {
      const mockResult = { width: 10, height: 10, scale: 1, mediaType: null };
      const mockLoadAsync = jest.fn().mockResolvedValue(mockResult);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);
      await imageClass.loadAsync({ width: 10, height: 10 });

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.image.load',
        name: 'Image load unknown source',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
        },
      });
    });

    it('handles loadAsync failure', async () => {
      const error = new Error('Load failed');
      const mockLoadAsync = jest.fn().mockRejectedValue(error);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);

      await expect(imageClass.loadAsync('https://example.com/broken.png')).rejects.toThrow('Load failed');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Load failed',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('ends span when loadAsync throws synchronously', () => {
      const error = new Error('Invalid source');
      const mockLoadAsync = jest.fn().mockImplementation(() => {
        throw error;
      });
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;

      wrapExpoImage(imageClass);

      expect(() => imageClass.loadAsync('bad-source')).toThrow('Invalid source');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Invalid source',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('passes options through to original loadAsync', async () => {
      const mockResult = { width: 100, height: 100, scale: 1, mediaType: null };
      const mockLoadAsync = jest.fn().mockResolvedValue(mockResult);
      const imageClass = { prefetch: jest.fn(), loadAsync: mockLoadAsync } as unknown as ExpoImage;
      const onError = jest.fn();

      wrapExpoImage(imageClass);
      await imageClass.loadAsync('https://example.com/img.png', { maxWidth: 800, onError });

      expect(mockLoadAsync).toHaveBeenCalledWith('https://example.com/img.png', { maxWidth: 800, onError });
    });
  });

  it('preserves other static methods', () => {
    const mockClearMemoryCache = jest.fn().mockResolvedValue(true);
    const mockClearDiskCache = jest.fn().mockResolvedValue(true);
    const imageClass = {
      prefetch: jest.fn().mockResolvedValue(true),
      loadAsync: jest.fn().mockResolvedValue({}),
      clearMemoryCache: mockClearMemoryCache,
      clearDiskCache: mockClearDiskCache,
    } as unknown as ExpoImage;

    wrapExpoImage(imageClass);

    expect((imageClass as ExpoImage & { clearMemoryCache: jest.Mock }).clearMemoryCache).toBe(mockClearMemoryCache);
    expect((imageClass as ExpoImage & { clearDiskCache: jest.Mock }).clearDiskCache).toBe(mockClearDiskCache);
  });
});
