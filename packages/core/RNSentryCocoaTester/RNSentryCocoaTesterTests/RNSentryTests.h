#import <Foundation/Foundation.h>
#import <RNSentry/RNSentry.h>

@interface
SentrySDK (PrivateTests)
- (nullable SentryOptions *) options;
@end

@interface SentryBinaryImageInfo : NSObject
@property (nonatomic, strong) NSString *name;
@property (nonatomic) uint64_t address;
@property (nonatomic) uint64_t size;
@end

@interface SentryBinaryImageCache : NSObject
@property (nonatomic, readonly, class) SentryBinaryImageCache *shared;
- (void)start;
- (void)stop;
- (nullable SentryBinaryImageInfo *)imageByAddress:(const uint64_t)address;
@end

@interface SentryDependencyContainer : NSObject
+ (instancetype)sharedInstance;
@property (nonatomic, strong) SentryDebugImageProvider *debugImageProvider;
@property (nonatomic, strong) SentryBinaryImageCache *binaryImageCache;
@end
