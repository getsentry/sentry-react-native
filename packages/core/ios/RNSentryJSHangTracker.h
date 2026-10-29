#import <Foundation/Foundation.h>

#ifdef __cplusplus
#    include <memory>
namespace facebook::react {
class CallInvoker;
}
#endif

NS_ASSUME_NONNULL_BEGIN

@interface RNSentryJSHangTracker : NSObject

+ (instancetype)sharedInstance;

#ifdef __cplusplus
- (void)setJSInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker;
#endif

- (void)startWithTimeoutInterval:(NSTimeInterval)timeoutInterval;

- (void)stop;

@end

NS_ASSUME_NONNULL_END
