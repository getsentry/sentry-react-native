#import <Foundation/Foundation.h>

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

@interface SentryScreenFramesWrapper : NSObject

+ (BOOL)canTrackFrames;
+ (NSNumber *)totalFrames;
+ (NSNumber *)frozenFrames;
+ (NSNumber *)slowFrames;
+ (NSNumber *)framesDelayForStartTimestamp:(double)startTimestampSeconds
                              endTimestamp:(double)endTimestampSeconds;

@end

#endif // TARGET_OS_IPHONE || TARGET_OS_MACCATALYST
