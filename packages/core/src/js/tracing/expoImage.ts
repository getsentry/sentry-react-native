import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startInactiveSpan } from '@sentry/core';

import { SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE } from './origin';
import { describeUrl, sanitizeUrl, traceAsyncOperation } from './utils';

/**
 * Internal interface for expo-image's ImageSource.
 * We define this to avoid a hard dependency on expo-image.
 */
interface ExpoImageSource {
  uri?: string;
  headers?: Record<string, string>;
  width?: number | null;
  height?: number | null;
  cacheKey?: string;
}

/**
 * Internal interface for expo-image's ImageLoadOptions.
 * We define this to avoid a hard dependency on expo-image.
 */
interface ExpoImageLoadOptions {
  maxWidth?: number;
  maxHeight?: number;
  onError?(error: Error, retry: () => void): void;
}

/**
 * Internal interface for expo-image's ImageRef.
 * We define this to avoid a hard dependency on expo-image.
 */
interface ExpoImageRef {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly mediaType: string | null;
  readonly isAnimated?: boolean;
}

/**
 * Represents the expo-image `Image` class with its static methods.
 * We only describe the methods that we instrument.
 */
export interface ExpoImage {
  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  prefetch(urls: string | string[], cachePolicyOrOptions?: any): Promise<boolean>;
  loadAsync(source: ExpoImageSource | string | number, options?: ExpoImageLoadOptions): Promise<ExpoImageRef>;
  clearMemoryCache?(): Promise<boolean>;
  clearDiskCache?(): Promise<boolean>;
}

/**
 * Wraps expo-image's `Image` class to add automated performance monitoring.
 *
 * This function instruments `Image.prefetch` and `Image.loadAsync` static methods
 * to create performance spans that measure how long image prefetching and loading take.
 *
 * @param imageClass - The `Image` class from `expo-image`
 * @returns The same class with instrumented static methods
 *
 * @example
 * ```typescript
 * import { Image } from 'expo-image';
 * import * as Sentry from '@sentry/react-native';
 *
 * Sentry.wrapExpoImage(Image);
 * ```
 */
export function wrapExpoImage<T extends ExpoImage>(imageClass: T): T {
  if (!imageClass) {
    return imageClass;
  }

  if ((imageClass as T & { __sentryWrapped?: boolean }).__sentryWrapped) {
    return imageClass;
  }

  wrapPrefetch(imageClass);
  wrapLoadAsync(imageClass);

  (imageClass as T & { __sentryWrapped?: boolean }).__sentryWrapped = true;

  return imageClass;
}

function wrapPrefetch<T extends ExpoImage>(imageClass: T): void {
  if (!imageClass.prefetch) {
    return;
  }

  const originalPrefetch = imageClass.prefetch.bind(imageClass);

  // oxlint-disable-next-line typescript-eslint(no-explicit-any)
  imageClass.prefetch = ((urls: string | string[], cachePolicyOrOptions?: any): Promise<boolean> => {
    const urlList = Array.isArray(urls) ? urls : [urls];
    const urlCount = urlList.length;
    const firstUrl = urlList[0] || 'unknown';
    const description = urlCount === 1 ? describeUrl(firstUrl) : `${urlCount} images`;

    const span = startInactiveSpan({
      op: 'resource.image.prefetch',
      name: `Image prefetch ${description}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
        'image.url_count': urlCount,
        ...(urlCount === 1 ? { 'image.url': sanitizeUrl(firstUrl) } : undefined),
      },
    });

    try {
      return originalPrefetch(urls, cachePolicyOrOptions)
        .then(result => {
          if (result) {
            span?.setStatus({ code: SPAN_STATUS_OK });
          } else {
            span?.setStatus({ code: SPAN_STATUS_ERROR, message: 'prefetch_failed' });
          }
          span?.end();
          return result;
        })
        .catch((error: unknown) => {
          span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
          span?.end();
          throw error;
        });
    } catch (error) {
      span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
      span?.end();
      throw error;
    }
  }) as T['prefetch'];
}

function wrapLoadAsync<T extends ExpoImage>(imageClass: T): void {
  if (!imageClass.loadAsync) {
    return;
  }

  const originalLoadAsync = imageClass.loadAsync.bind(imageClass);

  imageClass.loadAsync = ((
    source: ExpoImageSource | string | number,
    options?: ExpoImageLoadOptions,
  ): Promise<ExpoImageRef> => {
    const description = describeSource(source);

    const imageUrl =
      typeof source === 'string' ? source : typeof source === 'object' && source.uri ? source.uri : undefined;

    return traceAsyncOperation(
      {
        op: 'resource.image.load',
        name: `Image load ${description}`,
        attributes: {
          'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_IMAGE,
          ...(imageUrl ? { 'image.url': sanitizeUrl(imageUrl) } : undefined),
        },
      },
      () => originalLoadAsync(source, options),
    );
  }) as T['loadAsync'];
}

function describeSource(source: ExpoImageSource | string | number): string {
  if (typeof source === 'number') {
    return `asset #${source}`;
  }
  if (typeof source === 'string') {
    return describeUrl(source);
  }
  if (source.uri) {
    return describeUrl(source.uri);
  }
  return 'unknown source';
}
