#import "RNSentryJSHangTracker.h"
#import "SentrySDKWrapper.h"

#import <Sentry/Sentry.h>
#import <UIKit/UIKit.h>
#import <atomic>
#import <mutex>
#import <sstream>
#import <time.h>

#import <ReactCommon/CallInvoker.h>

#if __has_include(<hermes/hermes.h>) && SENTRY_PROFILING_SUPPORTED
#    define SENTRY_JS_HANG_HERMES_STACK 1
#    import <hermes/hermes.h>
#else
#    define SENTRY_JS_HANG_HERMES_STACK 0
#endif

static const useconds_t kPollIntervalUs = 100 * 1000;
static const useconds_t kStackSampleWindowUs = 300 * 1000;
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
}

@implementation RNSentryJSHangTracker {
    std::mutex _invokerMutex;
    std::shared_ptr<facebook::react::CallInvoker> _jsInvoker;
    std::shared_ptr<PingState> _state;
    NSThread *_thread;
    uint64_t _timeoutNs;
    std::atomic<bool> _appActive;
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
        _state = std::make_shared<PingState>();
        _appActive = true;
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        [center addObserver:self
                   selector:@selector(appDidBecomeActive)
                       name:UIApplicationDidBecomeActiveNotification
                     object:nil];
        [center addObserver:self
                   selector:@selector(appWillResignActive)
                       name:UIApplicationWillResignActiveNotification
                     object:nil];
    }
    return self;
}

- (void)setJSInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
    std::lock_guard<std::mutex> lock(_invokerMutex);
    _jsInvoker = std::move(jsInvoker);
}

- (std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
    std::lock_guard<std::mutex> lock(_invokerMutex);
    return _jsInvoker;
}

- (void)startWithTimeoutInterval:(NSTimeInterval)timeoutInterval
{
    @synchronized(self) {
        if (_thread != nil) {
            return;
        }
        _timeoutNs = (uint64_t)(timeoutInterval * NSEC_PER_SEC);
        _thread = [[NSThread alloc] initWithTarget:self selector:@selector(run) object:nil];
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

- (void)appDidBecomeActive
{
    _state->armed = false;
    _appActive = true;
}

- (void)appWillResignActive
{
    _appActive = false;
}

- (void)run
{
    auto state = _state;
    bool reported = false;
    uint64_t timeoutNs = _timeoutNs;

    while (![NSThread currentThread].isCancelled) {
        auto invoker = [self jsInvoker];
        if (invoker && _appActive && !state->inFlight.load()) {
            state->inFlight = true;
            state->sentAt = nowNs();
            invoker->invokeAsync([state](facebook::jsi::Runtime &) {
                state->inFlight = false;
                state->armed = true;
            });
        }

        usleep(kPollIntervalUs);

        if (state->inFlight.load()) {
            uint64_t blockedNs = nowNs() - state->sentAt.load();
            if (!reported && _appActive && state->armed.load() && blockedNs >= timeoutNs) {
                reported = true;
                [self reportHangBlockedFor:blockedNs];
            }
        } else if (reported) {
            NSLog(@"[Sentry] JS thread hang ended.");
            reported = false;
        }
    }
}

- (void)reportHangBlockedFor:(uint64_t)blockedNs
{
    NSArray<SentryFrame *> *frames = [self captureJSStack];
    NSString *value = [NSString
        stringWithFormat:@"JS thread blocked for at least %llu ms.", blockedNs / NSEC_PER_MSEC];
    NSLog(@"[Sentry] %@ Captured %lu JS frames.", value, (unsigned long)frames.count);

    SentryException *exception = [[SentryException alloc] initWithValue:value
                                                                   type:@"JS Thread Hang"];
    SentryMechanism *mechanism = [[SentryMechanism alloc] initWithType:@"js_hang"];
    mechanism.handled = @NO;
    exception.mechanism = mechanism;
    if (frames.count > 0) {
        exception.stacktrace = [[SentryStacktrace alloc] initWithFrames:frames registers:@{ }];
    }

    SentryEvent *event = [[SentryEvent alloc] initWithLevel:kSentryLevelError];
    event.exceptions = @[ exception ];
    [SentrySDKWrapper captureEvent:event];
}

- (NSArray<SentryFrame *> *)captureJSStack
{
#if SENTRY_JS_HANG_HERMES_STACK
    std::stringstream ss;
    try {
#    ifdef NEW_HERMES_RUNTIME
        auto *hermesAPI = facebook::jsi::castInterface<facebook::hermes::IHermesRootAPI>(
            facebook::hermes::makeHermesRootAPI());
        if (!hermesAPI) {
            return @[];
        }
        hermesAPI->enableSamplingProfiler();
        usleep(kStackSampleWindowUs);
        hermesAPI->disableSamplingProfiler();
        hermesAPI->dumpSampledTraceToStream(ss);
#    else
        facebook::hermes::HermesRuntime::enableSamplingProfiler();
        usleep(kStackSampleWindowUs);
        facebook::hermes::HermesRuntime::disableSamplingProfiler();
        facebook::hermes::HermesRuntime::dumpSampledTraceToStream(ss);
#    endif
    } catch (...) {
        return @[];
    }

    std::string trace = ss.str();
    NSData *data = [NSData dataWithBytes:trace.data() length:trace.size()];
    NSDictionary *profile = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    NSArray *samples = profile[@"samples"];
    NSDictionary *stackFrames = profile[@"stackFrames"];
    if (![samples isKindOfClass:[NSArray class]] || samples.count == 0
        || ![stackFrames isKindOfClass:[NSDictionary class]]) {
        return @[];
    }

    NSMutableArray<SentryFrame *> *frames = [NSMutableArray array];
    id frameId = samples.lastObject[@"sf"];
    while (frameId != nil && frameId != [NSNull null]) {
        NSDictionary *hermesFrame = stackFrames[[NSString stringWithFormat:@"%@", frameId]];
        if (hermesFrame == nil) {
            break;
        }
        SentryFrame *frame = [self sentryFrameFromHermesFrame:hermesFrame];
        if (frame != nil) {
            [frames insertObject:frame atIndex:0];
        }
        frameId = hermesFrame[@"parent"];
    }
    return frames;
#else
    return @[];
#endif
}

- (nullable SentryFrame *)sentryFrameFromHermesFrame:(NSDictionary *)hermesFrame
{
    NSString *name = hermesFrame[@"name"];
    if (![hermesFrame[@"category"] isEqual:@"JavaScript"] || [name isEqual:@"[root]"]) {
        return nil;
    }

    SentryFrame *frame = [[SentryFrame alloc] init];
    frame.platform = @"javascript";
    frame.fileName = kBundleFileName;
    NSRange paren = [name rangeOfString:@"("];
    frame.function = paren.location == NSNotFound ? name : [name substringToIndex:paren.location];

    id funcVirtAddr = hermesFrame[@"funcVirtAddr"];
    id offset = hermesFrame[@"offset"];
    if (funcVirtAddr != nil && offset != nil) {
        frame.lineNumber = @1;
        frame.columnNumber = @([funcVirtAddr longLongValue] + [offset longLongValue] + 1);
    } else {
        frame.lineNumber = @([hermesFrame[@"line"] longLongValue]);
        frame.columnNumber = @([hermesFrame[@"column"] longLongValue]);
    }
    return frame;
}

@end
