#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    import "RNSentryReplayUnmask.h"

#    ifdef RCT_NEW_ARCH_ENABLED
#        import <react/renderer/components/RNSentrySpec/ComponentDescriptors.h>
#        import <react/renderer/components/RNSentrySpec/Props.h>
#        import <react/renderer/components/RNSentrySpec/RCTComponentViewHelpers.h>
// RCTFabricComponentsPlugins needed for RNSentryReplayUnmaskCls
#        import <React/RCTFabricComponentsPlugins.h>
#    endif

@implementation RNSentryReplayUnmaskManager

RCT_EXPORT_MODULE(RNSentryReplayUnmask)

- (UIView *)view
{
    return [RNSentryReplayUnmask new];
}

@end

#    ifdef RCT_NEW_ARCH_ENABLED
@interface RNSentryReplayUnmask () <RCTRNSentryReplayUnmaskViewProtocol>
@end
#    endif

@implementation RNSentryReplayUnmask

#    ifdef RCT_NEW_ARCH_ENABLED
// Fabric requires typed default props, or mounting aborts in -updateProps:oldProps:.
- (instancetype)initWithFrame:(CGRect)frame
{
    if (self = [super initWithFrame:frame]) {
        static const auto defaultProps
            = std::make_shared<const facebook::react::RNSentryReplayUnmaskProps>();
        _props = defaultProps;
    }
    return self;
}

+ (facebook::react::ComponentDescriptorProvider)componentDescriptorProvider
{
    return facebook::react::concreteComponentDescriptorProvider<
        facebook::react::RNSentryReplayUnmaskComponentDescriptor>();
}
#    endif

@end

#    ifdef RCT_NEW_ARCH_ENABLED
Class<RCTComponentViewProtocol>
RNSentryReplayUnmaskCls(void)
{
    return RNSentryReplayUnmask.class;
}
#    endif

#endif
