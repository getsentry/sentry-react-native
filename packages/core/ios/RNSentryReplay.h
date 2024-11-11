
@interface RNSentryReplay : NSObject

+ (void)updateOptions:(NSMutableDictionary *)options;

+ (void)postInit;

+ (Class)getMaskClass;

+ (Class)getUnmaskClass;

@end
