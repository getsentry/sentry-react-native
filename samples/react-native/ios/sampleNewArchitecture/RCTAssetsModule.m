#import "RCTAssetsModule.h"

@implementation RCTAssetsModule
{
  bool hasListeners;
}

// Will be called when this module's first listener is added.
-(void)startObserving {
    hasListeners = YES;
    [self startSendingFakeSpans];
}

// Will be called when this module's last listener is removed, or on dealloc.
-(void)stopObserving {
    hasListeners = NO;
}

- (void)startSendingFakeSpans
{
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.01 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    if (hasListeners) {// Only send events if anyone is listening
      [self sendEventWithName:@"span" body:@{@"startTimestamp": @([[NSDate date] timeIntervalSince1970])}];
    }
    [self startSendingFakeSpans];
  });
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"span"];
}


RCT_EXPORT_METHOD(getExampleAssetData: (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSDataAsset *data = [[NSDataAsset alloc] initWithName:@"ExampleBinaryData"];
  if (data == nil) {
    reject(@"SampleSentryReactNative",@"Failed to load exmaple binary data asset.", nil);
  }

  NSMutableArray *array = [NSMutableArray arrayWithCapacity:data.data.length];

  const char *bytes = [data.data bytes];

  for (int i = 0; i < [data.data length]; i++)
  {
      [array addObject:[[NSNumber alloc] initWithChar:bytes[i]]];
  }

  resolve(array);
}

RCT_EXPORT_MODULE(AssetsModule);

@end
