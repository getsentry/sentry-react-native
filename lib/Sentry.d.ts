declare namespace Sentry {
    enum LogLevel {
        None = 0,
        Error = 1,
        Debug = 2,
        Verbose = 3
    }

    type BreadcrumbType = "navigation" | "http";

    type Severity = "critical" | "error" | "warning" | "info" | "debug" | "fatal";

    interface Options {
        logLevel?: LogLevel;
        instrument?: boolean;
        disableNativeIntegration?: boolean;
        ignoreModulesExclude?: [string];
        ignoreModulesInclude?: [string];
    }

    interface Breadcrumb {
        message?: string;
        category?: string;
        level?: Severity;
        data?: object;
        type?: BreadcrumbType;
    }

    interface SentryStatic {
        install(): void;

        config(dsn: string, options?: Options): SentryStatic;

        isNativeClientAvailable(): boolean;

        install(): void;

        crash(): void;

        nativeCrash(): void;

        setEventSentSuccessfully(callback: Function): void;

        setDataCallback(callback: Function): void;

        setUserContext(user: {
            id?: string;
            username?: string;
            email?: string;
            extra?: object;
        }): void;

        setTagsContext(tags: Object): void;

        setExtraContext(extra: Object): void;

        captureMessage(message: string, options?: object): void;

        captureException(ex: Error, options?: object): void;

        captureBreadcrumb(breadcrumb: Breadcrumb): void;

        clearContext(): void;

        context(func: Function, ...args: any[]): void;
        context(options: Options, func: Function, ...args: any[]): void;

        wrap(func: Function): Function;
        wrap(options: Options, func: Function): Function;
        wrap<T extends Function>(func: T): T;
        wrap<T extends Function>(options: Options, func: T): T;

        lastException(): object;
        lastException(): null;

        lastEventId(): object;
        lastEventId(): null;

        setRelease(release: string): void;

        setDist(dist: string): void;

        setVersion(version: string): void;
    }
}

declare module 'Sentry' {
    interface Sentry extends Sentry.SentryStatic {
        Options: Sentry.Options,
        LogLevel: Sentry.LogLevel,
        Severity: Sentry.Severity,
    }
    var Sentry: Sentry;

    export = Sentry;
}
