import { AsyncExpiringMap } from '../utils/AsyncExpiringMap';

const TIME_TO_DISPLAY_FALLBACK_TTL_MS = 60_000;

const spanIdToTimeToInitialDisplayFallback: AsyncExpiringMap<string, number | undefined | null> = new AsyncExpiringMap({
  ttl: TIME_TO_DISPLAY_FALLBACK_TTL_MS,
});

export const addTimeToInitialDisplayFallback = (
  spanId: string,
  timestampSeconds: Promise<number | undefined | null>,
): void => {
  spanIdToTimeToInitialDisplayFallback.set(spanId, timestampSeconds);
};

export const getTimeToInitialDisplayFallback = async (spanId: string): Promise<number | undefined> => {
  return spanIdToTimeToInitialDisplayFallback.get(spanId);
};
