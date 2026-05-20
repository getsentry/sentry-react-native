import type { Breadcrumb } from '@sentry/core';

import { breadcrumbFromObject } from '../src/js/breadcrumb';

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
        timestamp: 1577836800,
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

    it('convert plain object with numeric timestamp to a valid Breadcrumb', () => {
      const candidate = {
        type: 'test',
        level: 'info',
        timestamp: 1730985899,
      };
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{
        type: 'test',
        level: 'info',
        timestamp: 1730985899,
      });
    });

    it('ignores NaN numeric timestamp', () => {
      const candidate = {
        type: 'test',
        timestamp: NaN,
      };
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{
        type: 'test',
      });
    });

    it('convert empty object to a valid Breadcrumb', () => {
      const candidate = {};
      const breadcrumb = breadcrumbFromObject(candidate);
      expect(breadcrumb).toEqual(<Breadcrumb>{});
    });
  });
});
