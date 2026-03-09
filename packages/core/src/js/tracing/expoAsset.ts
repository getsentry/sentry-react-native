import { SPAN_STATUS_ERROR, SPAN_STATUS_OK, startInactiveSpan } from '@sentry/core';
import { SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET } from './origin';
import { describeUrl } from './utils';

/**
 * Internal interface for expo-asset's Asset instance.
 * We define this to avoid a hard dependency on expo-asset.
 */
export interface ExpoAssetInstance {
  name: string;
  type: string;
  hash: string | null;
  uri: string;
  localUri: string | null;
  width: number | null;
  height: number | null;
  downloaded: boolean;
  downloadAsync(): Promise<ExpoAssetInstance>;
}

/**
 * Represents the expo-asset `Asset` class with its static methods.
 * We only describe the methods that we instrument.
 */
export interface ExpoAsset {
  loadAsync(moduleId: number | number[] | string | string[]): Promise<ExpoAssetInstance[]>;
  fromModule(virtualAssetModule: number | string): ExpoAssetInstance;
}

/**
 * Wraps expo-asset's `Asset` class to add automated performance monitoring.
 *
 * This function instruments `Asset.loadAsync` static method
 * to create performance spans that measure how long asset loading takes.
 *
 * @param assetClass - The `Asset` class from `expo-asset`
 * @returns The same class with instrumented static methods
 *
 * @example
 * ```typescript
 * import { Asset } from 'expo-asset';
 * import * as Sentry from '@sentry/react-native';
 *
 * Sentry.wrapExpoAsset(Asset);
 * ```
 */
export function wrapExpoAsset<T extends ExpoAsset>(assetClass: T): T {
  if (!assetClass) {
    return assetClass;
  }

  if ((assetClass as T & { __sentryWrapped?: boolean }).__sentryWrapped) {
    return assetClass;
  }

  wrapLoadAsync(assetClass);

  (assetClass as T & { __sentryWrapped?: boolean }).__sentryWrapped = true;

  return assetClass;
}

function wrapLoadAsync<T extends ExpoAsset>(assetClass: T): void {
  if (!assetClass.loadAsync) {
    return;
  }

  const originalLoadAsync = assetClass.loadAsync.bind(assetClass);

  assetClass.loadAsync = ((moduleId: number | number[] | string | string[]): Promise<ExpoAssetInstance[]> => {
    const moduleIds = Array.isArray(moduleId) ? moduleId : [moduleId];
    const assetCount = moduleIds.length;
    const description = describeModuleIds(moduleIds);

    const span = startInactiveSpan({
      op: 'resource.asset',
      name: `Asset load ${description}`,
      attributes: {
        'sentry.origin': SPAN_ORIGIN_AUTO_RESOURCE_EXPO_ASSET,
        'asset.count': assetCount,
      },
    });

    return originalLoadAsync(moduleId)
      .then(result => {
        span?.setStatus({ code: SPAN_STATUS_OK });
        span?.end();
        return result;
      })
      .catch((error: unknown) => {
        span?.setStatus({ code: SPAN_STATUS_ERROR, message: String(error) });
        span?.end();
        throw error;
      });
  }) as T['loadAsync'];
}

function describeModuleIds(moduleIds: (number | string)[]): string {
  if (moduleIds.length === 1) {
    const id = moduleIds[0];
    if (typeof id === 'string') {
      return describeUrl(id);
    }
    return `asset #${id}`;
  }
  return `${moduleIds.length} assets`;
}


