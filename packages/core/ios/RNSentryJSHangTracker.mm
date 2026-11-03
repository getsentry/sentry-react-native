#import "RNSentryJSHangTracker.h"

#import "RNSentryHermesSampler.h"
#import "SentrySDKWrapper.h"
#import <Sentry/Sentry.h>
#import <UIKit/UIKit.h>
#import <atomic>
#import <memory>
#import <sys/sysctl.h>
#import <time.h>
#import <unistd.h>

static const useconds_t kPollIntervalUs = 100 * 1000;
static const std::chrono::milliseconds kStackSampleWindow(300);
static NSString *const kBundleFileName = @"app:///main.jsbundle";

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
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        [center addObserver:self
                   selector:@selector(appDidEnterBackground)
                       name:UIApplicationDidEnterBackgroundNotification
                     object:nil];
        [center addObserver:self
                   selector:@selector(appWillEnterForeground)
                       name:UIApplicationWillEnterForegroundNotification
                     object:nil];
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
                       debugImages:(NSArray<NSDictionary *> *)debugImages
                scheduleOnJSThread:(RNSentryJSThreadScheduler)scheduleOnJSThread
{
    if ([NSThread isMainThread]) {
        _inForeground =
            [UIApplication sharedApplication].applicationState != UIApplicationStateBackground;
    }

    NSArray<NSDictionary *> *images = [debugImages copy];
    RNSentryJSThreadScheduler schedule = [scheduleOnJSThread copy];
    @synchronized(self) {
        [_thread cancel];
        _thread = [[NSThread alloc] initWithBlock:^{
            [self runWithTimeoutIntervalMs:timeoutIntervalMs
                               debugImages:images
                        scheduleOnJSThread:schedule];
        }];
        _thread.name = @"io.sentry.react.js-hang-tracker";
        [_thread start];
    }
}

- (void)stop
{
    @synchronized(self) {
        [_thread cancel];
        _thread = nil;
    }
}

- (void)runWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                     debugImages:(NSArray<NSDictionary *> *)debugImages
              scheduleOnJSThread:(RNSentryJSThreadScheduler)scheduleOnJSThread
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
            usleep(kPollIntervalUs);
            continue;
        }
        if (paused) {
            paused = false;
            state->sentAt = nowNs();
        }

        if (!state->inFlight) {
            state->sentAt = nowNs();
            state->inFlight = true;
            scheduleOnJSThread(^{
                state->inFlight = false;
                state->armed = true;
            });
        }

        usleep(kPollIntervalUs);

        if (!state->inFlight) {
            reported = false;
        } else if (!reported && state->armed && nowNs() - state->sentAt >= timeoutNs) {
            reported = true;
            [self reportHangWithTimeoutIntervalMs:timeoutIntervalMs debugImages:debugImages];
        }
    }
}

- (void)reportHangWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                            debugImages:(NSArray<NSDictionary *> *)debugImages
{
    @try {
        NSArray<SentryFrame *> *frames = @[];
        std::optional<std::string> trace = sentry::react::sampleHermesTrace(kStackSampleWindow);
        if (trace) {
            frames = [RNSentryJSHangTracker
                framesFromHermesTrace:[NSData dataWithBytes:trace->data() length:trace->size()]];
        }
        [SentrySDKWrapper
            captureEvent:[RNSentryJSHangTracker eventWithTimeoutIntervalMs:timeoutIntervalMs
                                                                    frames:frames
                                                               debugImages:debugImages]];
    } @catch (NSException *exception) {
        NSLog(@"[Sentry] Failed to report JS thread hang: %@", exception.reason);
    }
}

+ (NSArray<SentryFrame *> *)framesFromHermesTrace:(NSData *)trace
{
    NSDictionary *profile = [NSJSONSerialization JSONObjectWithData:trace options:0 error:nil];
    if (![profile isKindOfClass:[NSDictionary class]]) {
        return @[];
    }
    NSArray *samples = profile[@"samples"];
    NSDictionary *stackFrames = profile[@"stackFrames"];
    if (![samples isKindOfClass:[NSArray class]] || samples.count == 0
        || ![stackFrames isKindOfClass:[NSDictionary class]]) {
        return @[];
    }
    NSDictionary *lastSample = samples.lastObject;
    if (![lastSample isKindOfClass:[NSDictionary class]]) {
        return @[];
    }

    // Hermes links each frame to its caller, so the walk goes from the top frame to the root.
    NSMutableArray<SentryFrame *> *frames = [NSMutableArray array];
    id frameId = lastSample[@"sf"];
    for (NSUInteger depth = 0; frameId != nil && depth < stackFrames.count; depth++) {
        NSDictionary *hermesFrame = stackFrames[[NSString stringWithFormat:@"%@", frameId]];
        if (![hermesFrame isKindOfClass:[NSDictionary class]]) {
            break;
        }
        SentryFrame *frame = [self frameFromHermesFrame:hermesFrame];
        if (frame != nil) {
            [frames insertObject:frame atIndex:0];
        }
        frameId = hermesFrame[@"parent"];
    }
    return frames;
}

+ (nullable SentryFrame *)frameFromHermesFrame:(NSDictionary *)hermesFrame
{
    id name = hermesFrame[@"name"];
    if (![hermesFrame[@"category"] isEqual:@"JavaScript"] || ![name isKindOfClass:[NSString class]]
        || [name isEqualToString:@"[root]"]) {
        return nil;
    }

    SentryFrame *frame = [[SentryFrame alloc] init];
    frame.platform = @"javascript";
    frame.fileName = kBundleFileName;
    NSRange paren = [name rangeOfString:@"("];
    NSString *function
        = paren.location == NSNotFound ? name : [name substringToIndex:paren.location];
    frame.function = function.length > 0 ? function : nil;

    id funcVirtAddr = hermesFrame[@"funcVirtAddr"];
    id offset = hermesFrame[@"offset"];
    if (funcVirtAddr != nil && offset != nil) {
        // Hermes bytecode has one line, and its column is 0-based while Sentry's is 1-based.
        frame.lineNumber = @1;
        frame.columnNumber = @([funcVirtAddr longLongValue] + [offset longLongValue] + 1);
    } else {
        id line = hermesFrame[@"line"];
        id column = hermesFrame[@"column"];
        frame.lineNumber = line != nil ? @([line longLongValue]) : nil;
        frame.columnNumber = column != nil ? @([column longLongValue]) : nil;
    }
    return frame;
}

+ (SentryEvent *)eventWithTimeoutIntervalMs:(uint64_t)timeoutIntervalMs
                                     frames:(NSArray<SentryFrame *> *)frames
                                debugImages:(NSArray<NSDictionary *> *)debugImages
{
    // The value uses the timeout and not the measured time, so events without a stack trace group
    // together.
    NSString *value =
        [NSString stringWithFormat:@"JS thread blocked for at least %llu ms.", timeoutIntervalMs];
    SentryException *exception = [[SentryException alloc] initWithValue:value
                                                                   type:@"JS Thread Hang"];
    SentryMechanism *mechanism = [[SentryMechanism alloc] initWithType:@"JSHang"];
    mechanism.handled = @NO;
    exception.mechanism = mechanism;

    // A thread of its own keeps the native SDK from attaching the native threads, which do not
    // show the JS code.
    SentryThread *thread = [[SentryThread alloc] initWithThreadId:@0];
    thread.name = @"JavaScript";
    thread.crashed = @YES;
    thread.current = @NO;
    thread.isMain = @NO;
    exception.threadId = thread.threadId;
    if (frames.count > 0) {
        SentryStacktrace *stacktrace = [[SentryStacktrace alloc] initWithFrames:frames
                                                                      registers:@{ }];
        exception.stacktrace = stacktrace;
        thread.stacktrace = stacktrace;
    }

    NSMutableArray<SentryDebugMeta *> *debugMeta = [NSMutableArray array];
    for (NSDictionary *image in debugImages) {
        if (![image isKindOfClass:[NSDictionary class]]) {
            continue;
        }
        SentryDebugMeta *meta = [[SentryDebugMeta alloc] init];
        meta.type = image[@"type"];
        meta.debugID = image[@"debug_id"];
        meta.codeFile = image[@"code_file"];
        [debugMeta addObject:meta];
    }

    SentryEvent *event = [[SentryEvent alloc] initWithLevel:kSentryLevelError];
    event.exceptions = @[ exception ];
    event.threads = @[ thread ];
    if (debugMeta.count > 0) {
        event.debugMeta = debugMeta;
    }
    return event;
}

@end
