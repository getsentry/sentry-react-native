#import "RNSentry+Test.h"
#import <XCTest/XCTest.h>

#if TARGET_OS_IPHONE || TARGET_OS_MACCATALYST

@interface RNSentryUriValidationTests : XCTestCase

@property (nonatomic, strong) NSURL *symlinkURL;

@end

@implementation RNSentryUriValidationTests

- (void)tearDown
{
    if (self.symlinkURL) {
        [[NSFileManager defaultManager] removeItemAtURL:self.symlinkURL error:nil];
        self.symlinkURL = nil;
    }
    [super tearDown];
}

- (void)testEmptyPathReturnsFalse
{
    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:@""]);
}

- (void)testPathWithDotDotComponentReturnsFalse
{
    NSString *path = [NSTemporaryDirectory()
        stringByAppendingPathComponent:@"../Library/Cookies/Cookies.binarycookies"];
    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testPathUnderTmpReturnsTrue
{
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"image.jpg"];
    XCTAssertTrue([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testPathUnderCachesDirReturnsTrue
{
    NSString *cachesDir
        = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
    NSString *path = [cachesDir stringByAppendingPathComponent:@"thumbnail.png"];
    XCTAssertTrue([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testPathUnderDocumentsDirReturnsTrue
{
    NSString *docsDir
        = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES)
              .firstObject;
    NSString *path = [docsDir stringByAppendingPathComponent:@"attachment.jpg"];
    XCTAssertTrue([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testPathUnderLibraryReturnsFalse
{
    NSString *libraryDir
        = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES)
              .firstObject;
    NSString *path = [libraryDir stringByAppendingPathComponent:@"Cookies/Cookies.binarycookies"];
    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testAbsolutePathOutsideSandboxReturnsFalse
{
    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:@"/etc/passwd"]);
}

- (void)testPathUnderLibraryApplicationSupportReturnsFalse
{
    NSString *libraryDir
        = NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES)
              .firstObject;
    NSString *path = [libraryDir stringByAppendingPathComponent:@"Application Support/app.sqlite"];
    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:path]);
}

- (void)testSymlinkInTmpPointingOutsideSandboxReturnsFalse
{
    NSString *symlinkPath =
        [NSTemporaryDirectory() stringByAppendingPathComponent:@"sentry_test_symlink_passwd"];
    self.symlinkURL = [NSURL fileURLWithPath:symlinkPath];

    NSError *error = nil;
    [[NSFileManager defaultManager] removeItemAtPath:symlinkPath error:nil];
    BOOL created = [[NSFileManager defaultManager] createSymbolicLinkAtPath:symlinkPath
                                                        withDestinationPath:@"/etc/passwd"
                                                                      error:&error];
    XCTAssertTrue(created, @"Symlink creation failed: %@", error);

    XCTAssertFalse([RNSentry isPathUnderAllowedRootsForTesting:symlinkPath]);
}

@end

#endif
