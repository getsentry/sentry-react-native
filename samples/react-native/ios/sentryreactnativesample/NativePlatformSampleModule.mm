#import "NativePlatformSampleModule.h"

#ifdef RCT_NEW_ARCH_ENABLED

@implementation NativePlatformSampleModule

RCT_EXPORT_MODULE();

// Thanks to this guard, we won't compile this code when we build for the old architecture.
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativePlatformSampleModuleSpecJSI>(params);
}

- (NSString *)crashOrString {
  NSObject * nilObject = NULL;
  NSArray * _ = @[nilObject];
  return @"NEVER RETURNED";
}

@end

#endif
