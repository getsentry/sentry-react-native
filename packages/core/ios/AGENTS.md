# packages/core/ios — Objective-C & Swift

## Formatting & Linting

| Task | Command |
|------|---------|
| ObjC/C++ format (clang-format) | `yarn fix:clang` |
| Swift format (swiftlint) | `yarn fix:swift` |
| ObjC/C++ lint check | `yarn lint:clang` |
| Swift lint check | `yarn lint:swift` |

## Code Conventions

### Objective-C

- Use **clang-format** (enforced by CI)
- Prefix classes with **`RNSentry`**
- Use nullability annotations (`nullable`, `nonnull`)

### Swift

- Use **swiftlint** (enforced by CI)
- Follow Swift API design guidelines

## Error Handling Pattern

```objc
NSError *error = nil;
BOOL success = [self performOperation:&error];
if (!success) {
  [SentryLog logWithMessage:[NSString stringWithFormat:@"Operation failed: %@", error]
                   andLevel:kSentryLevelError];
  return fallback;
}
```

## Native Bridge Pattern (Objective-C)

```objc
RCT_EXPORT_METHOD(nativeOperation:(NSString *)param
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    BOOL result = [self performOperation:param];
    resolve(@(result));
  } @catch (NSException *exception) {
    reject(@"OPERATION_FAILED", exception.reason, nil);
  }
}
```

## Working with Local sentry-cocoa

1. Build sentry-cocoa: `cd sentry-cocoa && make init`
2. Edit `RNSentry.podspec` to remove version constraint
3. Add local pod to sample's Podfile:
   ```ruby
   pod 'Sentry/HybridSDK', :path => '../../../../sentry-cocoa'
   ```
