#import "RCTAssetsModule.h"

@implementation RCTAssetsModule

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

