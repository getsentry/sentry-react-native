jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));
import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';
import type { Breadcrumb } from '@sentry/types';

import { enableSyncToNative } from '../src/js/scopeSync';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';
import { NATIVE } from './mockWrapper';

jest.mock('../src/js/wrapper');

describe('ScopeSync', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('scope apis', () => {
    let scope: Scope;

    beforeEach(() => {
      scope = new Scope();
      enableSyncToNative(scope);
    });

    describe('addBreadcrumb', () => {
      it('it only syncs once per scope', () => {
        enableSyncToNative(scope);
        enableSyncToNative(scope);

        scope.addBreadcrumb({ message: 'test' });

        expect(NATIVE.addBreadcrumb).toBeCalledTimes(1);
      });

      it('adds default level if no level specified', () => {
        const breadcrumb = {
          message: 'test',
          timestamp: 1234,
        };
        scope.addBreadcrumb(breadcrumb);
        expect(scope.getLastBreadcrumb()).toEqual({
          message: 'test',
          timestamp: 1234,
          level: 'info',
        });
      });

      it('adds timestamp to breadcrumb without timestamp', () => {
        const breadcrumb = {
          message: 'test',
        };
        scope.addBreadcrumb(breadcrumb);
        expect(scope.getLastBreadcrumb()).toEqual(
          expect.objectContaining(<Breadcrumb>{ timestamp: expect.any(Number) }),
        );
      });

      it('passes breadcrumb with timestamp to native', () => {
        const breadcrumb = {
          message: 'test',
        };
        scope.addBreadcrumb(breadcrumb);
        expect(NATIVE.addBreadcrumb).toBeCalledWith(
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
        expect(NATIVE.addBreadcrumb).toBeCalledWith(
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
        expect(NATIVE.addBreadcrumb).toBeCalledWith(
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
        expect(NATIVE.addBreadcrumb).toBeCalledWith(
          expect.objectContaining({
            data: { value: 'foo' },
          }),
        );
      });
    });
  });

  describe('static apis', () => {
    beforeEach(() => {
      SentryCore.setCurrentClient(new TestClient(getDefaultTestClientOptions()));
      enableSyncToNative(SentryCore.getIsolationScope());
    });

    it('setUser', () => {
      const user = { id: '123' };
      SentryCore.setUser(user);
      expect(NATIVE.setUser).toHaveBeenCalledExactlyOnceWith({ id: '123' });
    });

    it('setTag', () => {
      SentryCore.setTag('key', 'value');
      expect(NATIVE.setTag).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setTags', () => {
      SentryCore.setTags({ key: 'value' });
      expect(NATIVE.setTag).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setExtra', () => {
      SentryCore.setExtra('key', 'value');
      expect(NATIVE.setExtra).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setExtras', () => {
      SentryCore.setExtras({ key: 'value' });
      expect(NATIVE.setExtra).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('addBreadcrumb', () => {
      SentryCore.addBreadcrumb({ message: 'test' });
      expect(NATIVE.addBreadcrumb).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'test' }));
    });

    it('setContext', () => {
      SentryCore.setContext('key', { key: 'value' });
      expect(NATIVE.setContext).toHaveBeenCalledExactlyOnceWith('key', { key: 'value' });
    });
  });
});
