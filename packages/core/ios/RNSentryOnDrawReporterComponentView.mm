#import <Sentry/SentryDefines.h>

#if SENTRY_HAS_UIKIT

#    ifdef RCT_NEW_ARCH_ENABLED

#        import "RNSentryOnDrawReporter.h"
#        import "RNSentryOnDrawReporterComponentView.h"

#        import <React/RCTComponentViewFactory.h>
#        import <React/UIView+React.h>
#        import <react/renderer/components/RNSentrySpec/ComponentDescriptors.h>
#        import <react/renderer/components/RNSentrySpec/Props.h>
#        import <react/renderer/components/RNSentrySpec/RCTComponentViewHelpers.h>
// RCTFabricComponentsPlugins needed for RNSentryOnDrawReporterCls
#        import <React/RCTFabricComponentsPlugins.h>

@interface RNSentryOnDrawReporterComponentView () <RCTRNSentryOnDrawReporterViewProtocol>
@end

@implementation RNSentryOnDrawReporterComponentView {
    // Holds the timing logic and is never mounted. Listening for frames doesn't need a window.
    RNSentryOnDrawReporterView *_reporter;
}

#        ifdef RCT_REMOVE_LEGACY_COMPONENT_INTEROP
// Registered here rather than through `componentProvider`, which React Native prefers over interop.
// Apps that keep the interop layer stay on the legacy view manager.
+ (void)load
{
    [[RCTComponentViewFactory currentComponentViewFactory] registerComponentViewClass:self];
}
#        endif

// Fabric requires typed default props, or mounting aborts in -updateProps:oldProps:.
- (instancetype)initWithFrame:(CGRect)frame
{
    if (self = [super initWithFrame:frame]) {
        static const auto defaultProps
            = std::make_shared<const facebook::react::RNSentryOnDrawReporterProps>();
        _props = defaultProps;
    }
    return self;
}

+ (facebook::react::ComponentDescriptorProvider)componentDescriptorProvider
{
    return facebook::react::concreteComponentDescriptorProvider<
        facebook::react::RNSentryOnDrawReporterComponentDescriptor>();
}

- (void)updateProps:(const facebook::react::Props::Shared &)props
           oldProps:(const facebook::react::Props::Shared &)oldProps
{
    [super updateProps:props oldProps:oldProps];

    const auto &newProps
        = *std::static_pointer_cast<const facebook::react::RNSentryOnDrawReporterProps>(props);

    if (_reporter == nil) {
        _reporter = [[RNSentryOnDrawReporterView alloc] init];
    }
    _reporter.initialDisplay = newProps.initialDisplay;
    _reporter.fullDisplay = newProps.fullDisplay;
    // Codegen represents an unset string as empty, while the reporter treats nil as "no span".
    _reporter.parentSpanId = newProps.parentSpanId.empty()
        ? nil
        : [NSString stringWithUTF8String:newProps.parentSpanId.c_str()];
    [_reporter didSetProps:@[]];
}

// Fabric reuses component views, and a stale span id would suppress the next screen's report.
- (void)prepareForRecycle
{
    [super prepareForRecycle];
    _reporter = nil;
}

@end

Class<RCTComponentViewProtocol>
RNSentryOnDrawReporterCls(void)
{
#        ifdef RCT_REMOVE_LEGACY_COMPONENT_INTEROP
    return RNSentryOnDrawReporterComponentView.class;
#        else
    // Nil makes React Native fall through to the legacy interop layer.
    return nil;
#        endif
}

#    endif

#endif
