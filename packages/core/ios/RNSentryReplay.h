
@interface RNSentryReplay : NSObject

/**
 * Updates the session replay options
 */
+ (void)updateOptions:(NSMutableDictionary *)options;

+ (void)postInit;

+ (Class)getMaskClass;

+ (Class)getUnmaskClass;

@end
