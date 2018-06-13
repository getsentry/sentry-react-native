// Type definitions for react-native-sentry
// Project: https://sentry.io
// Definitions by: Daniel Griesser <https://github.com/hazat>
// Definitions: https://github.com/getsentry/react-native-sentry
// TypeScript Version: 2.3

type SentryBreadcrumbType = "navigation" | "http";

interface SentryBreadcrumb {
  message?: string;
  category?: string;
  level?: SentrySeverity;
  data?: object;
  type?: SentryBreadcrumbType;
}

export enum SentrySeverity {
  Fatal = "fatal",
  Error = "error",
  Warning = "warning",
  Info = "info",
  Debug = "debug",
  Critical = "critical"
}

export enum SentryLog {
  None = 0,
  Error = 1,
  Debug = 2,
  Verbose = 3
}

interface SentryOptions {
  logLevel?: SentryLog;
  instrument?: boolean;
  disableNativeIntegration?: boolean;
  ignoreModulesExclude?: [string];
  ignoreModulesInclude?: [string];
  deactivateStacktraceMerging: boolean;
}

export default Sentry;

export class Sentry {
  install(): Promise<void>;

  static config(dsn: string, options?: SentryOptions): Sentry;

  static isNativeClientAvailable(): boolean;

  static crash(): void;

  static nativeCrash(): void;

  static setEventSentSuccessfully(callback: Function): void;

  static setShouldSendCallback(callback: Function): void;

  static setDataCallback(callback: Function): void;

  static setUserContext(user: {
    id?: string;
    username?: string;
    email?: string;
    extra?: object;
  }): void;

  static setTagsContext(tags: Object): void;

  static setExtraContext(extra: Object): void;

  static captureMessage(message: string, options?: object): void;

  static captureException(ex: Error, options?: object): void;

  static captureBreadcrumb(breadcrumb: SentryBreadcrumb): void;

  static clearContext(): Promise<void>;

  static context(func: Function, ...args: any[]): void;
  static context(options: object, func: Function, ...args: any[]): void;

  static wrap(func: Function): Function;
  static wrap(options: object, func: Function): Function;
  static wrap<T extends Function>(func: T): T;
  static wrap<T extends Function>(options: object, func: T): T;

  static lastException(): object;
  static lastException(): null;

  static lastEventId(): object;
  static lastEventId(): null;

  static setRelease(release: string): void;

  static setDist(dist: string): void;

  static setVersion(version: string): void;
}
