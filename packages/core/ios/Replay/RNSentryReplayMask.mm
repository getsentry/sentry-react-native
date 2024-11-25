#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import "RNSentryReplayMask.h"

#    ifdef RCT_NEW_ARCH_ENABLED
#        import <react/renderer/components/RNSentrySpec/ComponentDescriptors.h>
#        import <react/renderer/components/RNSentrySpec/RCTComponentViewHelpers.h>
// RCTFabricComponentsPlugins needed for RNSentryReplayMaskCls
#        import <React/RCTFabricComponentsPlugins.h>
#    endif

@implementation RNSentryReplayMaskManager

RCT_EXPORT_MODULE(RNSentryReplayMask)

- (UIView *)view
{
    return [RNSentryReplayMask new];
}

@end

#    ifdef RCT_NEW_ARCH_ENABLED
@interface
RNSentryReplayMask () <RCTRNSentryReplayMaskViewProtocol>
@end
#    endif

@implementation RNSentryReplayMask

#    ifdef RCT_NEW_ARCH_ENABLED
+ (facebook::react::ComponentDescriptorProvider)componentDescriptorProvider
{
    return facebook::react::concreteComponentDescriptorProvider<
        facebook::react::RNSentryReplayMaskComponentDescriptor>();
}
#    endif

@end

#    ifdef RCT_NEW_ARCH_ENABLED
Class<RCTComponentViewProtocol>
RNSentryReplayMaskCls(void)
{
    return RNSentryReplayMask.class;
}
#    endif

#endif
