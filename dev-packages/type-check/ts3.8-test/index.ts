declare global {
  interface History {}
  interface IDBObjectStore {}
  interface Window {
    fetch: any;
  }
  interface ShadowRoot {}
  interface BufferSource {}
  interface PerformanceResourceTiming {
    decodedBodySize: any;
    encodedBodySize: any;
    duration: any;
    domInteractive: any;
    domContentLoadedEventEnd: any;
    domContentLoadedEventStart: any;
    loadEventStart: any;
    loadEventEnd: number;
    domComplete: number;
    redirectCount: number;
  }
  interface PerformanceEntry {}
}

declare module 'react-native' {
  export interface TurboModule {}
}

import 'react-native';

// we need to import the SDK to ensure tsc check the types
import * as _Sentry from '@sentry/react-native';
