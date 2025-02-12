#import "TurboModuleProvider.h"

#ifdef RCT_NEW_ARCH_ENABLED
#    import <NativeSampleModule.h>
#endif

@implementation TurboModuleProvider

+ (std::shared_ptr<facebook::react::TurboModule>)
    getTurboModule:(const std::string &)name
         jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
#ifdef RCT_NEW_ARCH_ENABLED
    if (name == "NativeSampleModule") {
        return std::make_shared<facebook::react::NativeSampleModule>(jsInvoker);
    }
#endif
    return nullptr;
}

@end
