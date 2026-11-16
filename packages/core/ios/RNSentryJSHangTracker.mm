#import "RNSentryJSHangTracker.h"

#import "RNSentryHermesSampler.h"
#import "SentrySDKWrapper.h"
#import <Sentry/Sentry.h>
#import <atomic>
#import <memory>
#import <sys/sysctl.h>
#import <time.h>

#if SENTRY_HAS_UIKIT
#    import <UIKit/UIKit.h>
#endif

static const int64_t kPollIntervalNs = 100 * NSEC_PER_MSEC;
static const std::chrono::milliseconds kStackSampleWindow(300);
static NSString *const kBundleFileName = @"app:///main.jsbundle";
static const NSUInteger kMaxFlamegraphBytes = 10 * 1024 * 1024;

namespace {
struct PingState {
    std::atomic<bool> inFlight { false };
    std::atomic<bool> armed { false };
    std::atomic<uint64_t> sentAt { 0 };
};

uint64_t
nowNs()
{
    return clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
}

bool
isDebuggerAttached()
{
    struct kinfo_proc info = { };
    size_t size = sizeof(info);
    int mib[] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid() };
    if (sysctl(mib, 4, &info, &size, NULL, 0) != 0) {
        return false;
    }
    return (info.kp_proc.p_flag & P_TRACED) != 0;
}
}

@implementation RNSentryJSHangTracker {
    NSThread *_thread;
    dispatch_semaphore_t _wakeUp;
    dispatch_semaphore_t _finished;
    std::atomic<bool> _inForeground;
}

+ (instancetype)sharedInstance
{
    static RNSentryJSHangTracker *instance;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ instance = [[RNSentryJSHangTracker alloc] init]; });
    return instance;
}

- (instancetype)init
{
    if (self = [super init]) {
        _inForeground = true;
#if SENTRY_HAS_UIKIT
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        [center addObserver:self
                   selector:@selector(appDidEnterBackground)
                       name:UIApplicationDidEnterBackgroundNotification
                     object:nil];
        [center addObserver:self
                   selector:@selector(appWillEnterForeground)
                       name:UIApplicationWillEnterForegroundNotification
                     object:nil];
#endif
    }
    return self;
}

- (void)appDidEnterBackground
{
    _inForeground = false;
}

- (void)appWillEnterForeground
{
    _inForeground = true;
}

- (void)startWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                     bundleDebugId:(nullable NSString *)bundleDebugId
                scheduleOnJSThread:(RNSentryJSThreadScheduler)scheduleOnJSThread
{
#if SENTRY_HAS_UIKIT
    if ([NSThread isMainThread]) {
        _inForeground =
            [UIApplication sharedApplication].applicationState != UIApplicationStateBackground;
    }
#endif

    NSString *debugId = [bundleDebugId copy];
    RNSentryJSThreadScheduler schedule = [scheduleOnJSThread copy];
    @synchronized(self) {
        [self stop];
        dispatch_semaphore_t wakeUp = dispatch_semaphore_create(0);
        dispatch_semaphore_t finished = dispatch_semaphore_create(0);
        _wakeUp = wakeUp;
        _finished = finished;
        _thread = [[NSThread alloc] initWithBlock:^{
            [self runWithTimeoutIntervalMs:timeoutIntervalMs
                             bundleDebugId:debugId
                        scheduleOnJSThread:schedule
                                    wakeUp:wakeUp];
            dispatch_semaphore_signal(finished);
        }];
        _thread.name = @"io.sentry.react.js-hang-tracker";
        [_thread start];
    }
}

- (void)stop
{
    @synchronized(self) {
        if (_thread == nil) {
            return;
        }
        [_thread cancel];
        dispatch_semaphore_signal(_wakeUp);
        // The tracker thread never waits for the main thread or for this lock, so it always ends.
        dispatch_semaphore_wait(_finished, DISPATCH_TIME_FOREVER);
        _thread = nil;
        _wakeUp = nil;
        _finished = nil;
    }
}

- (void)runWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                   bundleDebugId:(nullable NSString *)bundleDebugId
              scheduleOnJSThread:(RNSentryJSThreadScheduler)scheduleOnJSThread
                          wakeUp:(dispatch_semaphore_t)wakeUp
{
    // The tracker measures only after the JS thread answered once, so loading the bundle is not a
    // hang.
    auto state = std::make_shared<PingState>();
    uint64_t timeoutNs = timeoutIntervalMs * NSEC_PER_MSEC;
    bool reported = false;
    bool paused = false;
    NSThread *thread = [NSThread currentThread];

    while (!thread.isCancelled) {
        if (!_inForeground || isDebuggerAttached()) {
            paused = true;
            dispatch_semaphore_wait(wakeUp, dispatch_time(DISPATCH_TIME_NOW, kPollIntervalNs));
            continue;
        }
        if (paused) {
            paused = false;
            state->sentAt = nowNs();
        }

        if (!state->inFlight) {
            state->sentAt = nowNs();
            state->inFlight = true;
            BOOL scheduled = scheduleOnJSThread(^{
                state->inFlight = false;
                state->armed = true;
            });
            if (!scheduled) {
                // A new JS runtime must answer again before the tracker measures.
                state->inFlight = false;
                state->armed = false;
            }
        }

        dispatch_semaphore_wait(wakeUp, dispatch_time(DISPATCH_TIME_NOW, kPollIntervalNs));
        if (thread.isCancelled) {
            break;
        }

        if (!state->inFlight) {
            reported = false;
        } else if (!reported && state->armed && nowNs() - state->sentAt >= timeoutNs) {
            reported = true;
            [self reportHangWithTimeoutIntervalMs:timeoutIntervalMs
                                    bundleDebugId:bundleDebugId
                                           wakeUp:wakeUp];
        }
    }
}

- (void)reportHangWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                          bundleDebugId:(nullable NSString *)bundleDebugId
                                 wakeUp:(dispatch_semaphore_t)wakeUp
{
    // `stop` signals `wakeUp`, so it ends a running sample and does not wait for the window.
    std::optional<sentry::react::HermesTrace> trace
        = sentry::react::sampleHermesTrace(kStackSampleWindow, wakeUp);
    NSData *traceData
        = trace ? [NSData dataWithBytes:trace->json.data() length:trace->json.size()] : nil;
    BOOL newestFirst = trace && trace->fromProfile;
    BOOL attachFlamegraph = self.attachFlamegraph;

    // `stop` waits for this thread, so only the sample runs here. The capture also waits for the
    // main thread to take the screenshot.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        @try {
            NSArray<SentryFrame *> *frames = traceData != nil
                ? [RNSentryJSHangTracker framesFromHermesTrace:traceData newestFirst:newestFirst]
                : @[];
            SentryEvent *event = [RNSentryJSHangTracker eventWithTimeoutIntervalMs:timeoutIntervalMs
                                                                            frames:frames
                                                                     bundleDebugId:bundleDebugId];
            NSData *flamegraph = attachFlamegraph && traceData != nil
                ? [RNSentryJSHangTracker flamegraphFromHermesTrace:traceData
                                                       newestFirst:newestFirst
                                                     bundleDebugId:bundleDebugId]
                : nil;
            if (flamegraph != nil) {
                SentryAttachment *attachment =
                    [[SentryAttachment alloc] initWithData:flamegraph
                                                  filename:@"flamegraph.json"
                                               contentType:@"application/json"
                                            attachmentType:kSentryAttachmentTypeFlamegraph];
                [SentrySDKWrapper captureEvent:event attachment:attachment];
            } else {
                [SentrySDKWrapper captureEvent:event];
            }
        } @catch (NSException *exception) {
            NSLog(@"[Sentry] Failed to report JS thread hang: %@", exception.reason);
        }
    });
}

+ (NSArray<SentryFrame *> *)framesFromHermesTrace:(NSData *)trace newestFirst:(BOOL)newestFirst
{
    // A trace with unexpected JSON types gives an event without a stack trace.
    @try {
        NSDictionary *profile = [NSJSONSerialization JSONObjectWithData:trace options:0 error:nil];
        NSDictionary *stackFrames = profile[@"stackFrames"];
        // A profile trace starts before the hang, so its newest JS stack is the hang. A sample of
        // our own starts at the hang, and the JS thread can recover during the window, so its
        // oldest JS stack is the hang.
        NSArray *samples = profile[@"samples"];
        NSEnumerator *ordered
            = newestFirst ? samples.reverseObjectEnumerator : samples.objectEnumerator;
        for (NSDictionary *sample in ordered) {
            NSArray<SentryFrame *> *frames = [self framesFromFrameId:sample[@"sf"]
                                                         stackFrames:stackFrames];
            if (frames.count > 0) {
                return frames;
            }
        }
        return @[];
    } @catch (NSException *exception) {
        return @[];
    }
}

+ (nullable NSData *)flamegraphFromHermesTrace:(NSData *)trace
                                   newestFirst:(BOOL)newestFirst
                                 bundleDebugId:(nullable NSString *)bundleDebugId
{
    @try {
        NSDictionary *profile = [NSJSONSerialization JSONObjectWithData:trace options:0 error:nil];
        NSDictionary *stackFrames = profile[@"stackFrames"];
        NSArray<NSDictionary *> *samples = profile[@"samples"];

        NSString *attributedThreadId = nil;
        NSEnumerator *ordered
            = newestFirst ? samples.reverseObjectEnumerator : samples.objectEnumerator;
        for (NSDictionary *sample in ordered) {
            if ([self jsFrameIdsFromFrameId:sample[@"sf"] stackFrames:stackFrames].count > 0) {
                attributedThreadId = [sample[@"tid"] description] ?: @"";
                break;
            }
        }

        double newestTs = [samples.lastObject[@"ts"] doubleValue];
        double windowUs
            = std::chrono::duration_cast<std::chrono::microseconds>(kStackSampleWindow).count();

        NSMutableArray<NSDictionary *> *frames = [NSMutableArray array];
        NSMutableDictionary<NSString *, NSNumber *> *frameIndexes =
            [NSMutableDictionary dictionary];
        NSMutableArray<NSMutableDictionary *> *nodes = [NSMutableArray array];
        NSMutableArray<NSMutableDictionary<NSNumber *, NSNumber *> *> *nodeIndexesByFrame =
            [NSMutableArray array];
        NSMutableArray<NSMutableDictionary *> *trees = [NSMutableArray array];
        NSMutableDictionary<NSString *, NSMutableDictionary *> *treesByThread =
            [NSMutableDictionary dictionary];
        NSMutableDictionary<NSString *, NSMutableDictionary<NSNumber *, NSNumber *> *>
            *rootIndexesByThread = [NSMutableDictionary dictionary];

        for (NSDictionary *sample in samples) {
            if (newestFirst && newestTs - [sample[@"ts"] doubleValue] > windowUs) {
                continue;
            }
            NSArray<NSString *> *frameIds = [self jsFrameIdsFromFrameId:sample[@"sf"]
                                                            stackFrames:stackFrames];
            if (frameIds.count == 0) {
                continue;
            }

            id tid = sample[@"tid"];
            NSString *threadId = [tid description] ?: @"";
            NSMutableDictionary *tree = treesByThread[threadId];
            if (tree == nil) {
                tree = [NSMutableDictionary dictionaryWithObject:[NSMutableArray array]
                                                          forKey:@"roots"];
                if (tid != nil) {
                    tree[@"thread_id"] = threadId;
                }
                if ([threadId isEqualToString:attributedThreadId]) {
                    tree[@"thread_attributed"] = @YES;
                }
                [trees addObject:tree];
                treesByThread[threadId] = tree;
                rootIndexesByThread[threadId] = [NSMutableDictionary dictionary];
            }

            NSMutableArray<NSNumber *> *siblings = tree[@"roots"];
            NSMutableDictionary<NSNumber *, NSNumber *> *siblingIndexesByFrame
                = rootIndexesByThread[threadId];
            for (NSString *frameId in frameIds) {
                NSNumber *frameIndex = frameIndexes[frameId];
                if (frameIndex == nil) {
                    frameIndex = @(frames.count);
                    [frames addObject:[self profileFrameFromHermesFrame:stackFrames[frameId]]];
                    frameIndexes[frameId] = frameIndex;
                }

                NSNumber *nodeIndex = siblingIndexesByFrame[frameIndex];
                if (nodeIndex == nil) {
                    nodeIndex = @(nodes.count);
                    [nodes addObject:[@{
                        @"frame_id" : frameIndex,
                        @"sample_count" : @0,
                        @"children" : [NSMutableArray array],
                    } mutableCopy]];
                    [nodeIndexesByFrame addObject:[NSMutableDictionary dictionary]];
                    [siblings addObject:nodeIndex];
                    siblingIndexesByFrame[frameIndex] = nodeIndex;
                }

                NSMutableDictionary *node = nodes[nodeIndex.unsignedIntegerValue];
                node[@"sample_count"] = @([node[@"sample_count"] unsignedIntegerValue] + 1);
                siblings = node[@"children"];
                siblingIndexesByFrame = nodeIndexesByFrame[nodeIndex.unsignedIntegerValue];
            }
        }

        if (nodes.count == 0) {
            return nil;
        }

        NSMutableDictionary *flamegraph = [@{
            @"version" : @"1",
            @"platform" : @"javascript",
            @"frames" : frames,
            @"nodes" : nodes,
            @"trees" : trees,
        } mutableCopy];
        if (bundleDebugId != nil) {
            flamegraph[@"debug_meta"] = @{
                @"images" : @[ @{
                    @"type" : @"sourcemap",
                    @"debug_id" : bundleDebugId,
                    @"code_file" : kBundleFileName,
                } ]
            };
        }

        NSData *data = [NSJSONSerialization dataWithJSONObject:flamegraph options:0 error:nil];
        return data.length <= kMaxFlamegraphBytes ? data : nil;
    } @catch (NSException *exception) {
        return nil;
    }
}

+ (NSArray<SentryFrame *> *)framesFromFrameId:(nullable id)frameId
                                  stackFrames:(NSDictionary *)stackFrames
{
    NSMutableArray<SentryFrame *> *frames = [NSMutableArray array];
    for (NSString *jsFrameId in [self jsFrameIdsFromFrameId:frameId stackFrames:stackFrames]) {
        [frames addObject:[self frameFromHermesFrame:stackFrames[jsFrameId]]];
    }
    return frames;
}

/// Returns the ids of the JS frames in the stack, from the caller to the callee.
+ (NSArray<NSString *> *)jsFrameIdsFromFrameId:(nullable id)frameId
                                   stackFrames:(NSDictionary *)stackFrames
{
    // Hermes links each frame to its caller, so the walk goes from the top frame to the root.
    NSMutableArray<NSString *> *frameIds = [NSMutableArray array];
    for (NSUInteger depth = 0; frameId != nil && depth < stackFrames.count; depth++) {
        NSString *key = [frameId description];
        NSDictionary *hermesFrame = stackFrames[key];
        if (hermesFrame == nil) {
            break;
        }
        if ([self profileFrameFromHermesFrame:hermesFrame] != nil) {
            [frameIds insertObject:key atIndex:0];
        }
        frameId = hermesFrame[@"parent"];
    }
    return frameIds;
}

+ (nullable SentryFrame *)frameFromHermesFrame:(NSDictionary *)hermesFrame
{
    NSDictionary *profileFrame = [self profileFrameFromHermesFrame:hermesFrame];
    if (profileFrame == nil) {
        return nil;
    }

    SentryFrame *frame = [[SentryFrame alloc] init];
    frame.platform = profileFrame[@"platform"];
    frame.fileName = profileFrame[@"filename"];
    frame.function = profileFrame[@"function"];
    frame.lineNumber = profileFrame[@"lineno"];
    frame.columnNumber = profileFrame[@"colno"];
    return frame;
}

/// Maps a Hermes frame to a profile frame, which the event stack and the flame graph share.
+ (nullable NSDictionary *)profileFrameFromHermesFrame:(NSDictionary *)hermesFrame
{
    NSString *name = hermesFrame[@"name"];
    if (![hermesFrame[@"category"] isEqual:@"JavaScript"] || name == nil ||
        [name isEqualToString:@"[root]"]) {
        return nil;
    }

    NSMutableDictionary *frame = [NSMutableDictionary dictionary];
    frame[@"platform"] = @"javascript";
    frame[@"filename"] = kBundleFileName;
    frame[@"abs_path"] = kBundleFileName;
    NSRange paren = [name rangeOfString:@"("];
    NSString *function
        = paren.location == NSNotFound ? name : [name substringToIndex:paren.location];
    if (function.length > 0) {
        frame[@"function"] = function;
    }

    id funcVirtAddr = hermesFrame[@"funcVirtAddr"];
    id offset = hermesFrame[@"offset"];
    if (funcVirtAddr != nil && offset != nil) {
        // Hermes bytecode has one line, and its column is 0-based while Sentry's is 1-based.
        frame[@"lineno"] = @1;
        frame[@"colno"] = @([funcVirtAddr longLongValue] + [offset longLongValue] + 1);
    } else {
        id line = hermesFrame[@"line"];
        id column = hermesFrame[@"column"];
        if (line != nil) {
            frame[@"lineno"] = @([line longLongValue]);
        }
        if (column != nil) {
            frame[@"colno"] = @([column longLongValue]);
        }
    }
    return frame;
}

+ (SentryEvent *)eventWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                                     frames:(NSArray<SentryFrame *> *)frames
                              bundleDebugId:(nullable NSString *)bundleDebugId
{
    // The value uses the timeout and not the measured time, so events without a stack trace group
    // together.
    NSString *value =
        [NSString stringWithFormat:@"JS thread blocked for at least %llu ms.", timeoutIntervalMs];
    SentryException *exception = [[SentryException alloc] initWithValue:value
                                                                   type:@"JS Thread Hang"];
    // The app recovers from a hang, so like a native App Hang the event is handled and does not
    // mark the session as crashed.
    SentryMechanism *mechanism = [[SentryMechanism alloc] initWithType:@"JSHang"];
    mechanism.handled = @YES;
    exception.mechanism = mechanism;

    // A thread of its own keeps the native SDK from attaching the native threads, which do not
    // show the JS code.
    SentryThread *thread = [[SentryThread alloc] initWithThreadId:@0];
    thread.name = @"JavaScript";
    thread.current = @NO;
    thread.isMain = @NO;
    exception.threadId = thread.threadId;
    if (frames.count > 0) {
        SentryStacktrace *stacktrace = [[SentryStacktrace alloc] initWithFrames:frames
                                                                      registers:@{ }];
        exception.stacktrace = stacktrace;
        thread.stacktrace = stacktrace;
    }

    SentryEvent *event = [[SentryEvent alloc] initWithLevel:kSentryLevelError];
    event.exceptions = @[ exception ];
    event.threads = @[ thread ];
    if (bundleDebugId != nil) {
        SentryDebugMeta *bundle = [[SentryDebugMeta alloc] init];
        bundle.type = @"sourcemap";
        bundle.debugID = bundleDebugId;
        bundle.codeFile = kBundleFileName;
        event.debugMeta = @[ bundle ];
    }
    return event;
}

@end
