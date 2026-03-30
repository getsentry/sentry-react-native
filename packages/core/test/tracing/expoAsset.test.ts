import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';

import { type ExpoAsset, wrapExpoAsset } from '../../src/js/tracing';
import { SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET } from '../../src/js/tracing/origin';

const mockStartInactiveSpan = jest.fn();

jest.mock('@sentry/core', () => {
  const actual = jest.requireActual('@sentry/core');
  return {
    ...actual,
    startInactiveSpan: (...args: unknown[]) => mockStartInactiveSpan(...args),
  };
});

describe('wrapExpoAsset', () => {
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
    expect(wrapExpoAsset(null as unknown as ExpoAsset)).toBeNull();
    expect(wrapExpoAsset(undefined as unknown as ExpoAsset)).toBeUndefined();
  });

  it('does not double-wrap the same class', () => {
    const assetClass = {
      loadAsync: jest.fn().mockResolvedValue([]),
      fromModule: jest.fn(),
    } as unknown as ExpoAsset;

    const wrapped1 = wrapExpoAsset(assetClass);
    const wrapped2 = wrapExpoAsset(wrapped1);

    expect(wrapped1).toBe(wrapped2);
  });

  describe('loadAsync', () => {
    it('creates a span for loading a single numeric module ID', async () => {
      const mockAsset = { name: 'icon', type: 'png', downloaded: true };
      const mockLoadAsync = jest.fn().mockResolvedValue([mockAsset]);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      const result = await assetClass.loadAsync(42);

      expect(result).toEqual([mockAsset]);
      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.asset',
        name: 'Asset load asset #42',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET,
          'asset.count': 1,
        },
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SPAN_STATUS_OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('creates a span for loading a single string URL', async () => {
      const mockAsset = { name: 'photo', type: 'jpg', downloaded: true };
      const mockLoadAsync = jest.fn().mockResolvedValue([mockAsset]);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      await assetClass.loadAsync('https://example.com/photo.jpg');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.asset',
        name: 'Asset load photo.jpg',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET,
          'asset.count': 1,
        },
      });
    });

    it('creates a span for loading multiple numeric module IDs', async () => {
      const mockAssets = [
        { name: 'icon', type: 'png', downloaded: true },
        { name: 'splash', type: 'png', downloaded: true },
        { name: 'logo', type: 'svg', downloaded: true },
      ];
      const mockLoadAsync = jest.fn().mockResolvedValue(mockAssets);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      await assetClass.loadAsync([1, 2, 3]);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.asset',
        name: 'Asset load 3 assets',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET,
          'asset.count': 3,
        },
      });
    });

    it('creates a span for loading multiple string URLs', async () => {
      const mockAssets = [
        { name: 'a', type: 'png', downloaded: true },
        { name: 'b', type: 'png', downloaded: true },
      ];
      const mockLoadAsync = jest.fn().mockResolvedValue(mockAssets);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      await assetClass.loadAsync(['https://example.com/a.png', 'https://example.com/b.png']);

      expect(mockStartInactiveSpan).toHaveBeenCalledWith({
        op: 'resource.asset',
        name: 'Asset load 2 assets',
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET,
          'asset.count': 2,
        },
      });
    });

    it('handles loadAsync failure', async () => {
      const error = new Error('Asset not found');
      const mockLoadAsync = jest.fn().mockRejectedValue(error);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);

      await expect(assetClass.loadAsync(99)).rejects.toThrow('Asset not found');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Asset not found',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('passes the original moduleId argument through', async () => {
      const mockLoadAsync = jest.fn().mockResolvedValue([]);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      await assetClass.loadAsync([10, 20]);

      expect(mockLoadAsync).toHaveBeenCalledWith([10, 20]);
    });

    it('ends span when loadAsync throws synchronously', () => {
      const error = new Error('Invalid module ID');
      const mockLoadAsync = jest.fn().mockImplementation(() => {
        throw error;
      });
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);

      expect(() => assetClass.loadAsync(99)).toThrow('Invalid module ID');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SPAN_STATUS_ERROR,
        message: 'Error: Invalid module ID',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('handles non-URL string gracefully', async () => {
      const mockLoadAsync = jest.fn().mockResolvedValue([]);
      const assetClass = {
        loadAsync: mockLoadAsync,
        fromModule: jest.fn(),
      } as unknown as ExpoAsset;

      wrapExpoAsset(assetClass);
      await assetClass.loadAsync('not-a-url');

      expect(mockStartInactiveSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Asset load not-a-url',
        }),
      );
    });
  });

  it('preserves fromModule method', () => {
    const mockFromModule = jest.fn();
    const assetClass = {
      loadAsync: jest.fn().mockResolvedValue([]),
      fromModule: mockFromModule,
    } as unknown as ExpoAsset;

    wrapExpoAsset(assetClass);

    expect(assetClass.fromModule).toBe(mockFromModule);
  });
});
