import type { Outcome } from '@sentry/types';

/**
 * Merges buffer with new outcomes.
 */
export function mergeOutcomes(...merge: Outcome[][]): Outcome[] {
  const map = new Map<string, Outcome>();

  const process = (outcome: Outcome): void => {
    const key = `${outcome.reason}:${outcome.category}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += outcome.quantity;
    } else {
      map.set(key, outcome);
    }
  };

  merge.forEach(outcomes => outcomes.forEach(process));

  return [...map.values()];
}
