import { Scope } from '@sentry/core';
import type { Breadcrumb } from '@sentry/types';

import { enableSyncToNative } from '../src/js/scopeSync';
import { NATIVE } from '../src/js/wrapper';

jest.mock('../src/js/wrapper');

describe('ScopeSync', () => {
  describe('addBreadcrumb', () => {
    let scope: Scope;
    let nativeAddBreadcrumbMock: jest.Mock;

    beforeEach(() => {
      scope = new Scope();
      enableSyncToNative(scope);
      nativeAddBreadcrumbMock = (NATIVE.addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
        return;
      });
    });

    afterEach(() => {
      jest.resetAllMocks();
    });

    it('adds default level if no level specified', () => {
      const breadcrumb = {
        message: 'test',
        timestamp: 1234,
      };
      scope.addBreadcrumb(breadcrumb);
      expect(scope.getLastBreadcrumb()).toEqual(
        {
          message: 'test',
          timestamp: 1234,
          level: 'info',
        },
      );
    });

    it('adds timestamp to breadcrumb without timestamp', () => {
      const breadcrumb = {
        message: 'test',
      };
      scope.addBreadcrumb(breadcrumb);
      expect(scope.getLastBreadcrumb()).toEqual(expect.objectContaining(<Breadcrumb>{ timestamp: expect.any(Number) }));
    });

    it('passes breadcrumb with timestamp to native', () => {
      const breadcrumb = {
        message: 'test',
      };
      scope.addBreadcrumb(breadcrumb);
      expect(nativeAddBreadcrumbMock).toBeCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );
    });

    test('undefined breadcrumb data is not normalized when passing to the native layer', () => {
      const breadcrumb: Breadcrumb = {
        data: undefined,
      };
      scope.addBreadcrumb(breadcrumb);
      expect(nativeAddBreadcrumbMock).toBeCalledWith(
        expect.objectContaining({
          data: undefined,
        }),
      );
    });

    test('object is normalized when passing to the native layer', () => {
      const breadcrumb: Breadcrumb = {
        data: {
          foo: NaN,
        },
      };
      scope.addBreadcrumb(breadcrumb);
      expect(nativeAddBreadcrumbMock).toBeCalledWith(
        expect.objectContaining({
          data: { foo: '[NaN]' },
        }),
      );
    });

    test('not object data is converted to object', () => {
      const breadcrumb: Breadcrumb = {
        data: 'foo' as unknown as object,
      };
      scope.addBreadcrumb(breadcrumb);
      expect(nativeAddBreadcrumbMock).toBeCalledWith(
        expect.objectContaining({
          data: { value: 'foo' },
        }),
      );
    });
  });
});
