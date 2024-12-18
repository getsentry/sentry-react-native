jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));
import type { Breadcrumb } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';

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
    let setUserScopeSpy: jest.SpyInstance;
    let setTagScopeSpy: jest.SpyInstance;
    let setTagsScopeSpy: jest.SpyInstance;
    let setExtraScopeSpy: jest.SpyInstance;
    let setExtrasScopeSpy: jest.SpyInstance;
    let addBreadcrumbScopeSpy: jest.SpyInstance;
    let setContextScopeSpy: jest.SpyInstance;

    beforeAll(() => {
      const testScope = SentryCore.getIsolationScope();
      setUserScopeSpy = jest.spyOn(testScope, 'setUser');
      setTagScopeSpy = jest.spyOn(testScope, 'setTag');
      setTagsScopeSpy = jest.spyOn(testScope, 'setTags');
      setExtraScopeSpy = jest.spyOn(testScope, 'setExtra');
      setExtrasScopeSpy = jest.spyOn(testScope, 'setExtras');
      addBreadcrumbScopeSpy = jest.spyOn(testScope, 'addBreadcrumb');
      setContextScopeSpy = jest.spyOn(testScope, 'setContext');
    });

    beforeEach(() => {
      SentryCore.setCurrentClient(new TestClient(getDefaultTestClientOptions()));
      enableSyncToNative(SentryCore.getIsolationScope());
    });

    it('setUser', () => {
      expect(SentryCore.getIsolationScope().setUser).not.toBe(setUserScopeSpy);

      const user = { id: '123' };
      SentryCore.setUser(user);
      expect(NATIVE.setUser).toHaveBeenCalledExactlyOnceWith({ id: '123' });
      expect(setUserScopeSpy).toHaveBeenCalledExactlyOnceWith({ id: '123' });
    });

    it('setTag', () => {
      expect(SentryCore.getIsolationScope().setTag).not.toBe(setTagScopeSpy);

      SentryCore.setTag('key', 'value');
      expect(NATIVE.setTag).toHaveBeenCalledExactlyOnceWith('key', 'value');
      expect(setTagScopeSpy).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setTags', () => {
      expect(SentryCore.getIsolationScope().setTags).not.toBe(setTagsScopeSpy);

      SentryCore.setTags({ key: 'value', second: 'bar' });
      expect(NATIVE.setTag).toBeCalledTimes(2);
      expect(NATIVE.setTag).toHaveBeenCalledWith('key', 'value');
      expect(NATIVE.setTag).toHaveBeenCalledWith('second', 'bar');
      expect(setTagsScopeSpy).toHaveBeenCalledExactlyOnceWith({ key: 'value', second: 'bar' });
    });

    it('setExtra', () => {
      expect(SentryCore.getIsolationScope().setExtra).not.toBe(setExtraScopeSpy);

      SentryCore.setExtra('key', 'value');
      expect(NATIVE.setExtra).toHaveBeenCalledExactlyOnceWith('key', 'value');
      expect(setExtraScopeSpy).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setExtras', () => {
      expect(SentryCore.getIsolationScope().setExtras).not.toBe(setExtrasScopeSpy);

      SentryCore.setExtras({ key: 'value', second: 'bar' });
      expect(NATIVE.setExtra).toBeCalledTimes(2);
      expect(NATIVE.setExtra).toHaveBeenCalledWith('key', 'value');
      expect(NATIVE.setExtra).toHaveBeenCalledWith('second', 'bar');
      expect(setExtrasScopeSpy).toHaveBeenCalledExactlyOnceWith({ key: 'value', second: 'bar' });
    });

    it('addBreadcrumb', () => {
      expect(SentryCore.getIsolationScope().addBreadcrumb).not.toBe(addBreadcrumbScopeSpy);
      SentryCore.getIsolationScope().getLastBreadcrumb = jest.fn(() => ({ message: 'test' }));

      SentryCore.addBreadcrumb({ message: 'test' });
      expect(NATIVE.addBreadcrumb).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'test' }));
      expect(addBreadcrumbScopeSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: 'test' }),
        expect.any(Number),
      );
    });

    it('setContext', () => {
      expect(SentryCore.getIsolationScope().setContext).not.toBe(setContextScopeSpy);

      SentryCore.setContext('key', { key: 'value' });
      expect(NATIVE.setContext).toHaveBeenCalledExactlyOnceWith('key', { key: 'value' });
      expect(setContextScopeSpy).toHaveBeenCalledExactlyOnceWith('key', { key: 'value' });
    });
  });
});
