import type { Breadcrumb } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { Scope } from '@sentry/core';
import { enableSyncToNative } from '../src/js/scopeSync';
import { getDefaultTestClientOptions, TestClient } from './mocks/client';

jest.mock('../src/js/wrapper', () => jest.requireActual('./mockWrapper'));

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

        expect(NATIVE.addBreadcrumb).toHaveBeenCalledTimes(1);
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
        expect(NATIVE.addBreadcrumb).toHaveBeenCalledWith(
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
        expect(NATIVE.addBreadcrumb).toHaveBeenCalledWith(
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
        expect(NATIVE.addBreadcrumb).toHaveBeenCalledWith(
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
        expect(NATIVE.addBreadcrumb).toHaveBeenCalledWith(
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
    let setAttributeScopeSpy: jest.SpyInstance;
    let setAttributesScopeSpy: jest.SpyInstance;

    beforeAll(() => {
      const testScope = SentryCore.getIsolationScope();
      setUserScopeSpy = jest.spyOn(testScope, 'setUser');
      setTagScopeSpy = jest.spyOn(testScope, 'setTag');
      setTagsScopeSpy = jest.spyOn(testScope, 'setTags');
      setExtraScopeSpy = jest.spyOn(testScope, 'setExtra');
      setExtrasScopeSpy = jest.spyOn(testScope, 'setExtras');
      addBreadcrumbScopeSpy = jest.spyOn(testScope, 'addBreadcrumb');
      setContextScopeSpy = jest.spyOn(testScope, 'setContext');
      setAttributeScopeSpy = jest.spyOn(testScope, 'setAttribute');
      setAttributesScopeSpy = jest.spyOn(testScope, 'setAttributes');
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

    it('setUser with geo data', () => {
      expect(SentryCore.getIsolationScope().setUser).not.toBe(setUserScopeSpy);
      const user = {
        id: '123',
        email: 'test@example.com',
        geo: {
          city: 'San Francisco',
          country_code: 'US',
          region: 'California',
        },
      };
      SentryCore.setUser(user);
      expect(NATIVE.setUser).toHaveBeenCalledExactlyOnceWith(user);
      expect(setUserScopeSpy).toHaveBeenCalledExactlyOnceWith(user);
    });

    it('setTag', () => {
      jest.spyOn(NATIVE, 'primitiveProcessor').mockImplementation((value: SentryCore.Primitive) => value as string);
      expect(SentryCore.getIsolationScope().setTag).not.toBe(setTagScopeSpy);

      SentryCore.setTag('key', 'value');
      expect(NATIVE.setTag).toHaveBeenCalledExactlyOnceWith('key', 'value');
      expect(setTagScopeSpy).toHaveBeenCalledExactlyOnceWith('key', 'value');
    });

    it('setTags', () => {
      jest.spyOn(NATIVE, 'primitiveProcessor').mockImplementation((value: SentryCore.Primitive) => value as string);
      expect(SentryCore.getIsolationScope().setTags).not.toBe(setTagsScopeSpy);

      SentryCore.setTags({ key: 'value', second: 'bar' });
      expect(NATIVE.setTag).toHaveBeenCalledTimes(2);
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
      expect(NATIVE.setExtra).toHaveBeenCalledTimes(2);
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

    /*
      TODO: uncomment tests once native implementation is done.
    it('setAttribute', () => {
      expect(SentryCore.getIsolationScope().setAttribute).not.toBe(setAttributeScopeSpy);

      SentryCore.getIsolationScope().setAttribute('session_id', 'abc123');
      expect(NATIVE.setAttribute).toHaveBeenCalledExactlyOnceWith('session_id', 'abc123');
      expect(setAttributeScopeSpy).toHaveBeenCalledExactlyOnceWith('session_id', 'abc123');
    });

    it('setAttribute with number', () => {
      SentryCore.getIsolationScope().setAttribute('request_count', 42);
      expect(NATIVE.setAttribute).toHaveBeenCalledExactlyOnceWith('request_count', 42);
    });

    it('setAttribute with boolean', () => {
      SentryCore.getIsolationScope().setAttribute('is_admin', true);
      expect(NATIVE.setAttribute).toHaveBeenCalledExactlyOnceWith('is_admin', true);
    });

    it('setAttribute with non-primitive does not sync to native', () => {
      SentryCore.getIsolationScope().setAttribute('complex', { nested: 'object' });
      expect(NATIVE.setAttribute).not.toHaveBeenCalled();
    });

    it('setAttributes', () => {
      expect(SentryCore.getIsolationScope().setAttributes).not.toBe(setAttributesScopeSpy);

      SentryCore.getIsolationScope().setAttributes({
        session_type: 'test',
        request_count: 42,
        is_admin: true,
      });
      expect(NATIVE.setAttributes).toHaveBeenCalledExactlyOnceWith({
        session_type: 'test',
        request_count: 42,
        is_admin: true,
      });
      expect(setAttributesScopeSpy).toHaveBeenCalledExactlyOnceWith({
        session_type: 'test',
        request_count: 42,
        is_admin: true,
      });
    });

    it('setAttributes filters non-primitive values', () => {
      SentryCore.getIsolationScope().setAttributes({
        session_type: 'test',
        request_count: 42,
        complex: { nested: 'object' },
        is_admin: true,
      });
      expect(NATIVE.setAttributes).toHaveBeenCalledExactlyOnceWith({
        session_type: 'test',
        request_count: 42,
        is_admin: true,
      });
    });

    it('setAttributes does not sync to native if all values are non-primitive', () => {
      SentryCore.getIsolationScope().setAttributes({
        complex1: { nested: 'object' },
        complex2: ['array'],
      });
      expect(NATIVE.setAttributes).not.toHaveBeenCalled();
    });
    */
  });
});
