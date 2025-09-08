#import <Foundation/Foundation.h>

@interface SentryScreenFramesWrapper : NSObject

+ (BOOL)canTrackFrames;
+ (NSNumber *)totalFrames;
+ (NSNumber *)frozenFrames;
+ (NSNumber *)slowFrames;

@end
