import { IntegrationFn } from '@sentry/types';

const NAME = 'MobileReplay';

/**
 * MobileReplay Integration let's you change default options.
 * // TODO:
 */
export const mobileReplay: IntegrationFn = (_options: {
  // TODO: Common options for Android and iOS
} = {}) => {
  return {
    name: NAME,
    setupOnce() {},
  };
};
