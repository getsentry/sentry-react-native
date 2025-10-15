
@interface RNSentryReplay : NSObject

/**
 * Updates the session replay options
 * @return true when session replay is enabled
 */
+ (BOOL)updateOptions:(NSMutableDictionary *)options;

+ (void)postInit;

+ (Class)getMaskClass;

+ (Class)getUnmaskClass;

@end
