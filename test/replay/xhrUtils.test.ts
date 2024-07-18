import type { Breadcrumb } from '@sentry/types';

import { enrichXhrBreadcrumbsForMobileReplay } from '../../src/js/replay/xhrUtils';

describe('xhrUtils', () => {
  describe('enrichXhrBreadcrumbsForMobileReplay', () => {
    it('only changes xhr category breadcrumbs', () => {
      const breadcrumb: Breadcrumb = { category: 'http' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb).toEqual({ category: 'http' });
    });

    it('does nothing without hint', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, undefined);
      expect(breadcrumb).toEqual({ category: 'xhr' });
    });

    it('does nothing without xhr hint', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, {});
      expect(breadcrumb).toEqual({ category: 'xhr' });
    });

    it('set start and end timestamp', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          start_timestamp: 1,
          end_timestamp: 2,
        }),
      );
    });

    it('uses now as default timestamp', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, {
        ...getValidXhrHint(),
        startTimestamp: undefined,
        endTimestamp: undefined,
      });
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          start_timestamp: expect.any(Number),
          end_timestamp: expect.any(Number),
        }),
      );
    });

    it('sets request body size', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          request_body_size: 10,
        }),
      );
    });

    it('sets response body size', () => {
      const breadcrumb: Breadcrumb = { category: 'xhr' };
      enrichXhrBreadcrumbsForMobileReplay(breadcrumb, getValidXhrHint());
      expect(breadcrumb.data).toEqual(
        expect.objectContaining({
          response_body_size: 13,
        }),
      );
    });
  });
});

function getValidXhrHint() {
  return {
    startTimestamp: 1,
    endTimestamp: 2,
    input: 'test-input', // 10 bytes
    xhr: {
      getResponseHeader: (key: string) => {
        if (key === 'content-length') {
          return '13';
        }
        throw new Error('Invalid key');
      },
      response: 'test-response', // 13 bytes
      responseType: 'json',
    },
  };
}
