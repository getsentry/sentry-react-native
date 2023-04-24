import type { Breadcrumb } from '@sentry/types';

import { ReactNativeScope } from '../src/js/scope';
import { NATIVE } from '../src/js/wrapper';

jest.mock('../src/js/wrapper');

describe('Scope', () => {
  describe('addBreadcrumb', () => {

    beforeEach(() => {
      (NATIVE.addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
        return;
      });
    });

    it('adds default level if no level specified', () => {
      const scope = new ReactNativeScope() as ReactNativeScope & { _breadcrumbs: Breadcrumb[] };
      const breadcrumb = {
        message: 'test',
        timestamp: 1234,
      };
      scope.addBreadcrumb(breadcrumb);
      expect(scope._breadcrumbs).toEqual([
        {
          message: 'test',
          timestamp: 1234,
          level: 'info',
        },
      ]);
    });

    it('adds timestamp to breadcrumb without timestamp', () => {
      const scope = new ReactNativeScope() as ReactNativeScope & { _breadcrumbs: Breadcrumb[] };
      const breadcrumb = {
        message: 'test',
      };
      scope.addBreadcrumb(breadcrumb);
      expect(NATIVE.addBreadcrumb).toBeCalledWith(expect.objectContaining({
        timestamp: expect.any(Number),
      }));
    });
  });
});
