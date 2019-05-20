//
//  SentryEvent.m
//  Sentry
//
//  Created by Daniel Griesser on 05/05/2017.
//  Copyright © 2017 Sentry. All rights reserved.
//

#if __has_include(<Sentry/Sentry.h>)

#import <Sentry/SentryEvent.h>
#import <Sentry/SentryClient.h>
#import <Sentry/SentryUser.h>
#import <Sentry/SentryThread.h>
#import <Sentry/SentryException.h>
#import <Sentry/SentryStacktrace.h>
#import <Sentry/SentryContext.h>
#import <Sentry/SentryDebugMeta.h>
#import <Sentry/NSDate+Extras.h>
#import <Sentry/NSDictionary+Sanitize.h>

#else
#import "SentryEvent.h"
#import "SentryDebugMeta.h"
#import "SentryClient.h"
#import "SentryUser.h"
#import "SentryThread.h"
#import "SentryException.h"
#import "SentryStacktrace.h"
#import "SentryContext.h"
#import "NSDate+Extras.h"
#import "NSDictionary+Sanitize.h"
#endif

NS_ASSUME_NONNULL_BEGIN

@implementation SentryEvent

- (instancetype)initWithLevel:(enum SentrySeverity)level {
    self = [super init];
    if (self) {
        self.eventId = [[NSUUID UUID].UUIDString stringByReplacingOccurrencesOfString:@"-" withString:@""];
        self.level = level;
        self.platform = @"cocoa";
    }
    return self;
}

- (NSDictionary<NSString *, id> *)serialize {
    if (nil == self.timestamp) {
        self.timestamp = [NSDate date];
    }
    
    NSMutableDictionary *serializedData = @{
            @"event_id": self.eventId,
            @"timestamp": [self.timestamp sentry_toIso8601String],
            @"level": SentrySeverityNames[self.level],
            @"platform": @"cocoa",
    }.mutableCopy;

    if (nil == self.releaseName && nil == self.dist && nil != self.infoDict) {
        self.releaseName = [NSString stringWithFormat:@"%@-%@", self.infoDict[@"CFBundleIdentifier"], self.infoDict[@"CFBundleShortVersionString"]];
        self.dist = self.infoDict[@"CFBundleVersion"];
    }
    
    [self addSimpleProperties:serializedData];
    
    [self addOptionalListProperties:serializedData];
    
    // This is important here, since we probably use __sentry internal extras before
    [serializedData setValue:[self.extra sentry_sanitize] forKey:@"extra"];
    [serializedData setValue:self.tags forKey:@"tags"];
    
    return serializedData;
}

- (void)addOptionalListProperties:(NSMutableDictionary *)serializedData {
    [self addThreads:serializedData];
    [self addExceptions:serializedData];
    [self addDebugImages:serializedData];
}

- (void)addDebugImages:(NSMutableDictionary *)serializedData {
    NSMutableArray *debugImages = [NSMutableArray new];
    for (SentryDebugMeta *debugImage in self.debugMeta) {
        [debugImages addObject:[debugImage serialize]];
    }
    if (debugImages.count > 0) {
        [serializedData setValue:@{@"images": debugImages} forKey:@"debug_meta"];
    }
}

- (void)addExceptions:(NSMutableDictionary *)serializedData {
    NSMutableArray *exceptions = [NSMutableArray new];
    for (SentryThread *exception in self.exceptions) {
        [exceptions addObject:[exception serialize]];
    }
    if (exceptions.count > 0) {
        [serializedData setValue:@{@"values": exceptions} forKey:@"exception"];
    }
}

- (void)addThreads:(NSMutableDictionary *)serializedData {
    NSMutableArray *threads = [NSMutableArray new];
    for (SentryThread *thread in self.threads) {
        [threads addObject:[thread serialize]];
    }
    if (threads.count > 0) {
        [serializedData setValue:@{@"values": threads} forKey:@"threads"];
    }
}

- (void)addSdkInformation:(NSMutableDictionary *)serializedData {
    // If sdk was set, we don't take the default
    if (nil != self.sdk) {
        serializedData[@"sdk"] = self.sdk;
        return;
    }
    NSMutableDictionary *sdk = @{
                                 @"name": SentryClient.sdkName,
                                 @"version": SentryClient.versionString
                                 }.mutableCopy;
    if (self.extra[@"__sentry_sdk_integrations"]) {
        [sdk setValue:self.extra[@"__sentry_sdk_integrations"] forKey:@"integrations"];
    }
    serializedData[@"sdk"] = sdk;
}

- (void)addSimpleProperties:(NSMutableDictionary *)serializedData {
    [self addSdkInformation:serializedData];
    [serializedData setValue:self.releaseName forKey:@"release"];
    [serializedData setValue:self.dist forKey:@"dist"];
    [serializedData setValue:self.environment forKey:@"environment"];
    
    if (self.transaction) {
        [serializedData setValue:self.transaction forKey:@"transaction"];
    } else if (self.extra[@"__sentry_transaction"]) {
        [serializedData setValue:self.extra[@"__sentry_transaction"] forKey:@"transaction"];
    }
    
    [serializedData setValue:self.fingerprint forKey:@"fingerprint"];
    
    [serializedData setValue:[self.user serialize] forKey:@"user"];
    [serializedData setValue:self.modules forKey:@"modules"];
    
    [serializedData setValue:[self.stacktrace serialize] forKey:@"stacktrace"];
    
    [serializedData setValue:self.breadcrumbsSerialized[@"breadcrumbs"] forKey:@"breadcrumbs"];
    
    if (nil == self.context) {
        self.context = [[SentryContext alloc] init];
    }
    [serializedData setValue:[self.context serialize] forKey:@"contexts"];
    
    [serializedData setValue:self.message forKey:@"message"];
    [serializedData setValue:self.logger forKey:@"logger"];
    [serializedData setValue:self.serverName forKey:@"server_name"];
}

@end

NS_ASSUME_NONNULL_END
