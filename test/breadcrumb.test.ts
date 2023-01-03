import { Breadcrumb } from '@sentry/types';

import { breadcrumbEquals, breadcrumbFromObject } from '../src/js/breadcrumb';

describe('Breadcrumb', () => {
  describe('breadcrumbFromObject', () => {
    it('convert a plain object to a valid Breadcrumb', () => {
      const candidate = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: '2020-01-01T00:00:00.000Z',
      };
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      });
    });

    it('convert plain object with invalid timestamp to a valid Breadcrumb', () => {
      const candidate = {
        type: 'test',
        level: 'info',
        timestamp: 'invalid',
      };
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{
        type: 'test',
        level: 'info',
      });
    });

    it('convert empty object to a valid Breadcrumb', () => {
      const candidate = {};
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{});
    });
  });

  describe('breadcrumbEquals', () => {
    it('returns true if two breadcrumbs with different timestamp are equal', () => {
      const breadcrumb: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      const other: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800001,
      };
      expect(breadcrumbEquals(breadcrumb, other)).toBe(true);
    });

    it('returns true if two breadcrumbs with different level are equal', () => {
      const breadcrumb: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      const other: Breadcrumb = {
        type: 'test',
        level: 'warning',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      expect(breadcrumbEquals(breadcrumb, other)).toBe(true);
    });

    it('returns true if two breadcrumbs with different data are equal', () => {
      const breadcrumb: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      const other: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test2',
        },
        timestamp: 1577836800000,
      };
      expect(breadcrumbEquals(breadcrumb, other)).toBe(true);
    });

    it('returns false if breadcrumbs message is different', () => {
      const breadcrumb: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      const other: Breadcrumb = {
        type: 'test',
        level: 'info',
        event_id: '1234',
        category: 'test',
        message: 'test2',
        data: {
          test: 'test',
        },
        timestamp: 1577836800000,
      };
      expect(breadcrumbEquals(breadcrumb, other)).toBe(false);
    });
  });
});
