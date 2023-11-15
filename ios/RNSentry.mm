#import <dlfcn.h>
#import "RNSentry.h"

#if __has_include(<React/RCTConvert.h>)
#import <React/RCTConvert.h>
#else
#import "RCTConvert.h"
#endif

#if __has_include(<hermes/hermes.h>)
#define SENTRY_PROFILING_ENABLED 1
#import <Sentry/SentryProfilingConditionals.h>
#else
#define SENTRY_PROFILING_ENABLED 0
#define SENTRY_TARGET_PROFILING_SUPPORTED 0
#endif

#import <Sentry/Sentry.h>
#import <Sentry/PrivateSentrySDKOnly.h>
#import <Sentry/SentryScreenFrames.h>
#import <Sentry/SentryOptions+HybridSDKs.h>
#import <Sentry/SentryBinaryImageCache.h>
#import <Sentry/SentryDependencyContainer.h>
#import <Sentry/SentryFormatter.h>
#import <Sentry/SentryCurrentDateProvider.h>

// This guard prevents importing Hermes in JSC apps
#if SENTRY_PROFILING_ENABLED
#import <hermes/hermes.h>
#endif

// Thanks to this guard, we won't import this header when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
#import "RNSentrySpec.h"
#endif

@interface SentryTraceContext : NSObject
- (nullable instancetype)initWithDict:(NSDictionary<NSString *, id> *)dictionary;
@end

@interface SentrySDK (RNSentry)

+ (void)captureEnvelope:(SentryEnvelope *)envelope;

+ (void)storeEnvelope:(SentryEnvelope *)envelope;

@end

static bool didFetchAppStart;

static NSString* const nativeSdkName = @"sentry.cocoa.react-native";

@implementation RNSentry {
    bool sentHybridSdkDidBecomeActive;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(initNativeSdk:(NSDictionary *_Nonnull)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSError *error = nil;
    SentryOptions* sentryOptions = [self createOptionsWithDictionary:options error:&error];
    if (error != nil) {
        reject(@"SentryReactNative", error.localizedDescription, error);
        return;
    }

    NSString *sdkVersion = [PrivateSentrySDKOnly getSdkVersionString];
    [PrivateSentrySDKOnly setSdkName: nativeSdkName andVersionString: sdkVersion];

    [SentrySDK startWithOptions:sentryOptions];

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    BOOL appIsActive = [[UIApplication sharedApplication] applicationState] == UIApplicationStateActive;
#else
    BOOL appIsActive = [[NSApplication sharedApplication] isActive];
#endif

    // If the app is active/in foreground, and we have not sent the SentryHybridSdkDidBecomeActive notification, send it.
    if (appIsActive && !sentHybridSdkDidBecomeActive && (PrivateSentrySDKOnly.options.enableAutoSessionTracking || PrivateSentrySDKOnly.options.enableWatchdogTerminationTracking)) {
        [[NSNotificationCenter defaultCenter]
            postNotificationName:@"SentryHybridSdkDidBecomeActive"
            object:nil];

        sentHybridSdkDidBecomeActive = true;
    }

    resolve(@YES);
}

- (SentryOptions *_Nullable)createOptionsWithDictionary:(NSDictionary *_Nonnull)options
                                         error: (NSError *_Nonnull *_Nonnull) errorPointer
{
    SentryBeforeSendEventCallback beforeSend = ^SentryEvent*(SentryEvent *event) {
        // We don't want to send an event after startup that came from a Unhandled JS Exception of react native
        // Because we sent it already before the app crashed.
        if (nil != event.exceptions.firstObject.type &&
            [event.exceptions.firstObject.type rangeOfString:@"Unhandled JS Exception"].location != NSNotFound) {
            NSLog(@"Unhandled JS Exception");
            return nil;
        }

        [self setEventOriginTag:event];

        return event;
    };

    NSMutableDictionary * mutableOptions =[options mutableCopy];
    [mutableOptions setValue:beforeSend forKey:@"beforeSend"];

    // remove performance traces sample rate and traces sampler since we don't want to synchronize these configurations
    // to the Native SDKs.
    // The user could tho initialize the SDK manually and set themselves.
    [mutableOptions removeObjectForKey:@"tracesSampleRate"];
    [mutableOptions removeObjectForKey:@"tracesSampler"];
    [mutableOptions removeObjectForKey:@"enableTracing"];

    SentryOptions *sentryOptions = [[SentryOptions alloc] initWithDict:mutableOptions didFailWithError:errorPointer];
    if (*errorPointer != nil) {
        return nil;
    }

    if ([mutableOptions valueForKey:@"enableNativeCrashHandling"] != nil) {
        BOOL enableNativeCrashHandling = [mutableOptions[@"enableNativeCrashHandling"] boolValue];

        if (!enableNativeCrashHandling) {
            NSMutableArray *integrations = sentryOptions.integrations.mutableCopy;
            [integrations removeObject:@"SentryCrashIntegration"];
            sentryOptions.integrations = integrations;
        }
    }

    // Enable the App start and Frames tracking measurements
    if ([mutableOptions valueForKey:@"enableAutoPerformanceTracing"] != nil) {
        BOOL enableAutoPerformanceTracing = [mutableOptions[@"enableAutoPerformanceTracing"] boolValue];
        PrivateSentrySDKOnly.appStartMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
        PrivateSentrySDKOnly.framesTrackingMeasurementHybridSDKMode = enableAutoPerformanceTracing;
#endif
    }

    return sentryOptions;
}

- (void)setEventOriginTag:(SentryEvent *)event {
  if (event.sdk != nil) {
    NSString *sdkName = event.sdk[@"name"];

    // If the event is from react native, it gets set
    // there and we do not handle it here.
    if ([sdkName isEqual:nativeSdkName]) {
      [self setEventEnvironmentTag:event origin:@"ios" environment:@"native"];
    }
  }
}

- (void)setEventEnvironmentTag:(SentryEvent *)event
                        origin:(NSString *)origin
                   environment:(NSString *)environment {
  NSMutableDictionary *newTags = [NSMutableDictionary new];

  if (nil != event.tags && [event.tags count] > 0) {
    [newTags addEntriesFromDictionary:event.tags];
  }
  if (nil != origin) {
    [newTags setValue:origin forKey:@"event.origin"];
  }
  if (nil != environment) {
    [newTags setValue:environment forKey:@"event.environment"];
  }

  event.tags = newTags;
}

RCT_EXPORT_METHOD(fetchNativeSdkInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve(@{
        @"name": PrivateSentrySDKOnly.getSdkName,
        @"version": PrivateSentrySDKOnly.getSdkVersionString
            });
}

RCT_EXPORT_METHOD(fetchModules:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSString *filePath = [[NSBundle mainBundle] pathForResource:@"modules" ofType:@"json"];
    NSString* modulesString = [NSString stringWithContentsOfFile:filePath
                                                  encoding:NSUTF8StringEncoding
                                                     error:nil];
    resolve(modulesString);
}

RCT_EXPORT_METHOD(fetchNativePackageName:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSString *packageName = [[NSBundle mainBundle] executablePath];
    resolve(packageName);
}

- (NSDictionary*) fetchNativeStackFramesBy: (NSArray<NSNumber*>*)instructionsAddr
                               symbolicate: (SymbolicateCallbackType) symbolicate
{
  BOOL shouldSymbolicateLocally = [SentrySDK.options debug];
  NSString *appPackageName = [[NSBundle mainBundle] executablePath];

  NSMutableSet<NSString *> * _Nonnull imagesAddrToRetrieveDebugMetaImages = [[NSMutableSet alloc] init];
  NSMutableArray<NSDictionary<NSString *, id> *> * _Nonnull serializedFrames = [[NSMutableArray alloc] init];

  for (NSNumber *addr in instructionsAddr) {
    SentryBinaryImageInfo * _Nullable image = [[[SentryDependencyContainer sharedInstance] binaryImageCache] imageByAddress:[addr unsignedLongLongValue]];
    if (image != nil) {
      NSString * imageAddr = sentry_formatHexAddressUInt64([image address]);
      [imagesAddrToRetrieveDebugMetaImages addObject: imageAddr];

      NSDictionary<NSString *, id> * _Nonnull nativeFrame = @{
        @"platform": @"cocoa",
        @"instruction_addr": sentry_formatHexAddress(addr),
        @"package": [image name],
        @"image_addr": imageAddr,
        @"in_app": [NSNumber numberWithBool:[appPackageName isEqualToString:[image name]]],
      };

      if (shouldSymbolicateLocally) {
        Dl_info symbolsBuffer;
        bool symbols_succeed = false;
        symbols_succeed = symbolicate((void *) [addr unsignedLongLongValue], &symbolsBuffer) != 0;
        if (symbols_succeed) {
          NSMutableDictionary<NSString *, id> * _Nonnull symbolicated = nativeFrame.mutableCopy;
          symbolicated[@"symbol_addr"] = sentry_formatHexAddressUInt64((uintptr_t)symbolsBuffer.dli_saddr);
          symbolicated[@"function"] = [NSString stringWithCString:symbolsBuffer.dli_sname encoding:NSUTF8StringEncoding];

          nativeFrame = symbolicated;
        }
      }

      [serializedFrames addObject:nativeFrame];
    } else {
      [serializedFrames addObject: @{
        @"platform": @"cocoa",
        @"instruction_addr": sentry_formatHexAddress(addr),
      }];
    }
  }

  if (shouldSymbolicateLocally) {
    return @{
      @"frames": serializedFrames,
    };
  } else {
    NSMutableArray<NSDictionary<NSString *, id> *> * _Nonnull serializedDebugMetaImages = [[NSMutableArray alloc] init];

    NSArray<SentryDebugMeta *> *debugMetaImages = [[[SentryDependencyContainer sharedInstance] debugImageProvider] getDebugImagesForAddresses:imagesAddrToRetrieveDebugMetaImages isCrash:false];

    for (SentryDebugMeta *debugImage in debugMetaImages) {
      [serializedDebugMetaImages addObject:[debugImage serialize]];
    }

    return @{
      @"frames": serializedFrames,
      @"debugMetaImages": serializedDebugMetaImages,
    };
  }
}

RCT_EXPORT_METHOD(fetchNativeStackFramesBy:(NSArray *)instructionsAddr
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  resolve([self fetchNativeStackFramesBy:instructionsAddr
                             symbolicate:dladdr]);
}

RCT_EXPORT_METHOD(fetchNativeDeviceContexts:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"Bridge call to: deviceContexts");
    __block NSMutableDictionary<NSString *, id> *serializedScope;
    // Temp work around until sorted out this API in sentry-cocoa.
    // TODO: If the callback isnt' executed the promise wouldn't be resolved.
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        serializedScope = [[scope serialize] mutableCopy];

        NSDictionary<NSString *, id>  *user = [serializedScope valueForKey:@"user"];
        if (user == nil) {
            [serializedScope
                setValue:@{ @"id": PrivateSentrySDKOnly.installationID }
                forKey:@"user"];
        }

        if (PrivateSentrySDKOnly.options.debug) {
            NSData *data = [NSJSONSerialization dataWithJSONObject:serializedScope options:0 error:nil];
            NSString *debugContext = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
            NSLog(@"Contexts: %@", debugContext);
        }
    }];

    NSDictionary<NSString *, id> *extraContext = [PrivateSentrySDKOnly getExtraContext];
    NSMutableDictionary<NSString *, NSDictionary<NSString *, id> *> *contexts = [serializedScope[@"context"] mutableCopy];

    if (extraContext && [extraContext[@"device"] isKindOfClass:[NSDictionary class]]) {
      NSMutableDictionary<NSString *, NSDictionary<NSString *, id> *> *deviceContext = [contexts[@"device"] mutableCopy];
      [deviceContext addEntriesFromDictionary:extraContext[@"device"]];
      [contexts setValue:deviceContext forKey:@"device"];
    }

    if (extraContext && [extraContext[@"app"] isKindOfClass:[NSDictionary class]]) {
      NSMutableDictionary<NSString *, NSDictionary<NSString *, id> *> *appContext = [contexts[@"app"] mutableCopy];
      [appContext addEntriesFromDictionary:extraContext[@"app"]];
      [contexts setValue:appContext forKey:@"app"];
    }

    [serializedScope setValue:contexts forKey:@"contexts"];
    [serializedScope removeObjectForKey:@"context"];
    resolve(serializedScope);
}

RCT_EXPORT_METHOD(fetchNativeAppStart:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{

    SentryAppStartMeasurement *appStartMeasurement = PrivateSentrySDKOnly.appStartMeasurement;

    if (appStartMeasurement == nil) {
        resolve(nil);
    } else {
        BOOL isColdStart = appStartMeasurement.type == SentryAppStartTypeCold;

        resolve(@{
            @"isColdStart": [NSNumber numberWithBool:isColdStart],
            @"appStartTime": [NSNumber numberWithDouble:(appStartMeasurement.appStartTimestamp.timeIntervalSince1970 * 1000)],
            @"didFetchAppStart": [NSNumber numberWithBool:didFetchAppStart],
                });

    }

    // This is always set to true, as we would only allow an app start fetch to only happen once
    // in the case of a JS bundle reload, we do not want it to be instrumented again.
    didFetchAppStart = true;
}

RCT_EXPORT_METHOD(fetchNativeFrames:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    if (PrivateSentrySDKOnly.isFramesTrackingRunning) {
        SentryScreenFrames *frames = PrivateSentrySDKOnly.currentScreenFrames;

        if (frames == nil) {
            resolve(nil);
            return;
        }

        NSNumber *total = [NSNumber numberWithLong:frames.total];
        NSNumber *frozen = [NSNumber numberWithLong:frames.frozen];
        NSNumber *slow = [NSNumber numberWithLong:frames.slow];
        NSNumber *zero = [NSNumber numberWithLong:0L];

        if ([total isEqualToNumber:zero] && [frozen isEqualToNumber:zero] && [slow isEqualToNumber:zero]) {
            resolve(nil);
            return;
        }

        resolve(@{
            @"totalFrames": total,
            @"frozenFrames": frozen,
            @"slowFrames": slow,
        });
    } else {
      resolve(nil);
    }
#else
    resolve(nil);
#endif
}

RCT_EXPORT_METHOD(fetchNativeRelease:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSDictionary *infoDict = [[NSBundle mainBundle] infoDictionary];
    resolve(@{
              @"id": infoDict[@"CFBundleIdentifier"],
              @"version": infoDict[@"CFBundleShortVersionString"],
              @"build": infoDict[@"CFBundleVersion"],
              });
}

RCT_EXPORT_METHOD(captureEnvelope:(NSArray * _Nonnull)bytes
                  options: (NSDictionary * _Nonnull)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSMutableData *data = [[NSMutableData alloc] initWithCapacity: [bytes count]];
    for(NSNumber *number in bytes) {
        char byte = [number charValue];
        [data appendBytes: &byte length: 1];
    }

    SentryEnvelope *envelope = [PrivateSentrySDKOnly envelopeWithData:data];
    if (envelope == nil) {
        reject(@"SentryReactNative",@"Failed to parse envelope from byte array.", nil);
        return;
    }

    #if DEBUG
        [PrivateSentrySDKOnly captureEnvelope:envelope];
    #else
        if ([[options objectForKey:@"store"] boolValue]) {
            // Storing to disk happens asynchronously with captureEnvelope
            [PrivateSentrySDKOnly storeEnvelope:envelope];
        } else {
            [PrivateSentrySDKOnly captureEnvelope:envelope];
        }
    #endif
    resolve(@YES);
}

RCT_EXPORT_METHOD(captureScreenshot: (RCTPromiseResolveBlock)resolve
                  rejecter: (RCTPromiseRejectBlock)reject)
{
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    NSArray<NSData *>* rawScreenshots = [PrivateSentrySDKOnly captureScreenshots];
    NSMutableArray *screenshotsArray = [NSMutableArray arrayWithCapacity:[rawScreenshots count]];

    int counter = 1;
    for (NSData* raw in rawScreenshots) {
        NSMutableArray *screenshot = [NSMutableArray arrayWithCapacity:raw.length];
        const char *bytes = (char*) [raw bytes];
        for (int i = 0; i < [raw length]; i++) {
            [screenshot addObject:[[NSNumber alloc] initWithChar:bytes[i]]];
        }

        NSString* filename = @"screenshot.png";
        if (counter > 1) {
            filename = [NSString stringWithFormat:@"screenshot-%d.png", counter];
        }
        [screenshotsArray addObject:@{
            @"data": screenshot,
            @"contentType": @"image/png",
            @"filename": filename,
        }];
        counter++;
    }

    resolve(screenshotsArray);
#else
    resolve(nil);
#endif
}

RCT_EXPORT_METHOD(fetchViewHierarchy: (RCTPromiseResolveBlock)resolve
                  rejecter: (RCTPromiseRejectBlock)reject)
{
#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
    NSData * rawViewHierarchy = [PrivateSentrySDKOnly captureViewHierarchy];

    NSMutableArray *viewHierarchy = [NSMutableArray arrayWithCapacity:rawViewHierarchy.length];
    const char *bytes = (char*) [rawViewHierarchy bytes];
    for (int i = 0; i < [rawViewHierarchy length]; i++) {
        [viewHierarchy addObject:[[NSNumber alloc] initWithChar:bytes[i]]];
    }

    resolve(viewHierarchy);
#else
    resolve(nil);
#endif
}


RCT_EXPORT_METHOD(setUser:(NSDictionary *)userKeys
                  otherUserKeys:(NSDictionary *)userDataKeys
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        if (nil == userKeys && nil == userDataKeys) {
            [scope setUser:nil];
        } else {
            SentryUser* userInstance = [[SentryUser alloc] init];

            if (nil != userKeys) {
                [userInstance setUserId:userKeys[@"id"]];
                [userInstance setIpAddress:userKeys[@"ip_address"]];
                [userInstance setEmail:userKeys[@"email"]];
                [userInstance setUsername:userKeys[@"username"]];
                [userInstance setSegment:userKeys[@"segment"]];
            }

            if (nil != userDataKeys) {
                [userInstance setData:userDataKeys];
            }

            [scope setUser:userInstance];
        }
    }];
}

RCT_EXPORT_METHOD(addBreadcrumb:(NSDictionary *)breadcrumb)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        SentryBreadcrumb* breadcrumbInstance = [[SentryBreadcrumb alloc] init];

        NSString * levelString = breadcrumb[@"level"];
        SentryLevel sentryLevel;
        if ([levelString isEqualToString:@"fatal"]) {
            sentryLevel = kSentryLevelFatal;
        } else if ([levelString isEqualToString:@"warning"]) {
            sentryLevel = kSentryLevelWarning;
        } else if ([levelString isEqualToString:@"error"]) {
            sentryLevel = kSentryLevelError;
        } else if ([levelString isEqualToString:@"debug"]) {
            sentryLevel = kSentryLevelDebug;
        } else {
            sentryLevel = kSentryLevelInfo;
        }
        [breadcrumbInstance setLevel:sentryLevel];

        [breadcrumbInstance setCategory:breadcrumb[@"category"]];

        [breadcrumbInstance setType:breadcrumb[@"type"]];

        [breadcrumbInstance setMessage:breadcrumb[@"message"]];

        [breadcrumbInstance setData:breadcrumb[@"data"]];

        [scope addBreadcrumb:breadcrumbInstance];
    }];
}

RCT_EXPORT_METHOD(clearBreadcrumbs) {
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope clearBreadcrumbs];
    }];
}

RCT_EXPORT_METHOD(setExtra:(NSString *)key
                  extra:(NSString *)extra
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setExtraValue:extra forKey:key];
    }];
}

RCT_EXPORT_METHOD(setContext:(NSString *)key
                  context:(NSDictionary *)context
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setContextValue:context forKey:key];
    }];
}

RCT_EXPORT_METHOD(setTag:(NSString *)key
                  value:(NSString *)value
)
{
    [SentrySDK configureScope:^(SentryScope * _Nonnull scope) {
        [scope setTagValue:value forKey:key];
    }];
}

RCT_EXPORT_METHOD(crash)
{
    [SentrySDK crash];
}

RCT_EXPORT_METHOD(closeNativeSdk:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  [SentrySDK close];
  resolve(@YES);
}

RCT_EXPORT_METHOD(disableNativeFramesTracking)
{
    // Do nothing on iOS, this bridge method only has an effect on android.
}

RCT_EXPORT_METHOD(enableNativeFramesTracking)
{
    // Do nothing on iOS, this bridge method only has an effect on android.
    // If you're starting the Cocoa SDK manually,
    // you can set the 'enableAutoPerformanceTracing: true' option and
    // the 'tracesSampleRate' or 'tracesSampler' option.
}

static NSString* const enabledProfilingMessage = @"Enable Hermes to use Sentry Profiling.";
static SentryId* nativeProfileTraceId = nil;
static uint64_t nativeProfileStartTime = 0;

RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD(NSDictionary *, startProfiling)
{
#if SENTRY_PROFILING_ENABLED
    try {
        facebook::hermes::HermesRuntime::enableSamplingProfiler();
        if (nativeProfileTraceId == nil && nativeProfileStartTime == 0) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
            nativeProfileTraceId = [[SentryId alloc] init];
            nativeProfileStartTime = [PrivateSentrySDKOnly startProfilerForTrace: nativeProfileTraceId];
#endif
        } else {
            NSLog(@"Native profiling already in progress. Currently existing trace: %@", nativeProfileTraceId);
        }
        return @{ @"started": @YES };
    } catch (const std::exception& ex) {
        if (nativeProfileTraceId != nil) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
            [PrivateSentrySDKOnly discardProfilerForTrace: nativeProfileTraceId];
#endif
            nativeProfileTraceId = nil;
        }
        nativeProfileStartTime = 0;
        return @{ @"error": [NSString stringWithCString: ex.what() encoding:[NSString defaultCStringEncoding]] };
    } catch (...) {
        if (nativeProfileTraceId != nil) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
            [PrivateSentrySDKOnly discardProfilerForTrace: nativeProfileTraceId];
#endif
            nativeProfileTraceId = nil;
        }
        nativeProfileStartTime = 0;
        return @{ @"error": @"Failed to start profiling" };
    }
#else
    return @{ @"error": enabledProfilingMessage };
#endif
}

RCT_EXPORT_SYNCHRONOUS_TYPED_METHOD(NSDictionary *, stopProfiling)
{
#if SENTRY_PROFILING_ENABLED
    try {
        NSDictionary<NSString *, id> * nativeProfile = nil;
        if (nativeProfileTraceId != nil && nativeProfileStartTime != 0) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
            uint64_t nativeProfileStopTime = [[[SentryDependencyContainer sharedInstance] dateProvider] systemTime];
            nativeProfile = [PrivateSentrySDKOnly collectProfileBetween:nativeProfileStartTime and:nativeProfileStopTime forTrace:nativeProfileTraceId];
#endif
        }
        // Cleanup native profiles
        nativeProfileTraceId = nil;
        nativeProfileStartTime = 0;

        facebook::hermes::HermesRuntime::disableSamplingProfiler();
        std::stringstream ss;
        facebook::hermes::HermesRuntime::dumpSampledTraceToStream(ss);

        std::string s = ss.str();
        NSString *data = [NSString stringWithCString:s.c_str() encoding:[NSString defaultCStringEncoding]];

#if SENTRY_PROFILING_DEBUG_ENABLED
        NSString *rawProfileFileName = @"hermes.profile";
        NSError *error = nil;
        NSString *rawProfileFilePath = [NSTemporaryDirectory() stringByAppendingPathComponent:rawProfileFileName];
        if (![data writeToFile:rawProfileFilePath atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
            NSLog(@"Error writing Raw Hermes Profile to %@: %@", rawProfileFilePath, error);
        } else {
            NSLog(@"Raw Hermes Profile saved to %@", rawProfileFilePath);
        }
#endif

        if (data == nil) {
          return @{ @"error": @"Failed to retrieve Hermes profile." };
        }

        if (nativeProfile == nil) {
          return @{ @"profile": data };
        }

        return @{
          @"profile": data,
          @"nativeProfile": nativeProfile,
        };
    } catch (const std::exception& ex) {
        if (nativeProfileTraceId != nil) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
          [PrivateSentrySDKOnly discardProfilerForTrace: nativeProfileTraceId];
#endif
          nativeProfileTraceId = nil;
        }
        nativeProfileStartTime = 0;
        return @{ @"error": [NSString stringWithCString: ex.what() encoding:[NSString defaultCStringEncoding]] };
    } catch (...) {
        if (nativeProfileTraceId != nil) {
#if SENTRY_TARGET_PROFILING_SUPPORTED
          [PrivateSentrySDKOnly discardProfilerForTrace: nativeProfileTraceId];
#endif
          nativeProfileTraceId = nil;
        }
        nativeProfileStartTime = 0;
        return @{ @"error": @"Failed to stop profiling" };
    }
#else
    return @{ @"error": enabledProfilingMessage };
#endif
}

// Thanks to this guard, we won't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeRNSentrySpecJSI>(params);
}
#endif

@end
