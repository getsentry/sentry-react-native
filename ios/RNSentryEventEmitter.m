//
//  RNSentryEventEmitter.m
//  RNSentry
//
//  Created by Daniel Griesser on 25/04/2017.
//  Copyright © 2017 Facebook. All rights reserved.
//

#import "RNSentryEventEmitter.h"

NSString *const kEventSentSuccessfully = @"Sentry/eventSentSuccessfully";
NSString *const kEventStored = @"Sentry/eventStored";

@implementation RNSentryEventEmitter

RCT_EXPORT_MODULE();

- (NSDictionary<NSString *, NSString *> *)constantsToExport {
    return @{
             @"EVENT_SENT_SUCCESSFULLY": kEventSentSuccessfully,
             @"EVENT_STORED": kEventStored
             };
}

- (NSArray<NSString *> *)supportedEvents {
    return @[kEventSentSuccessfully, kEventStored];
}


- (void)startObserving {
    for (NSString *event in [self supportedEvents]) {
        [[NSNotificationCenter defaultCenter] addObserver:self
                                                 selector:@selector(handleNotification:)
                                                     name:event
                                                   object:nil];
    }
}

- (void)stopObserving {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}

+ (void)emitStoredEvent {
    [self postNotificationName:kEventStored withPayload:@""];
}

+ (void)postNotificationName:(NSString *)name withPayload:(NSObject *)object {
    NSDictionary<NSString *, id> *payload = @{@"payload": object};

    [[NSNotificationCenter defaultCenter] postNotificationName:name
                                                        object:self
                                                      userInfo:payload];
}

- (void)handleNotification:(NSNotification *)notification {
    [self sendEventWithName:notification.name body:notification.userInfo];
}

@end
