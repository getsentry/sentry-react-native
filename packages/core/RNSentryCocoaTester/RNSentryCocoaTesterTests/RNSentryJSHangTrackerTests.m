#import "RNSentryJSHangTracker+Test.h"
#import <XCTest/XCTest.h>
@import Sentry;

static NSDictionary *
jsFrame(NSString *name, NSNumber *_Nullable parent)
{
    NSMutableDictionary *frame = [@ {
        @"name" : name,
        @"category" : @"JavaScript",
        @"line" : @"10",
        @"column" : @"20",
    } mutableCopy];
    frame[@"parent"] = parent;
    return frame;
}

static NSDictionary *
sample(NSString *ts, NSString *tid, NSNumber *sf)
{
    return @{
        @"cpu" : @"-1",
        @"name" : @"",
        @"ts" : ts,
        @"pid" : @1,
        @"tid" : tid,
        @"weight" : @"1",
        @"sf" : sf,
    };
}

static NSData *
hermesTrace(NSDictionary *stackFrames, NSArray *samples)
{
    return [NSJSONSerialization dataWithJSONObject:@{
        @"traceEvents" : @[],
        @"stackFrames" : stackFrames,
        @"samples" : samples,
    }
                                           options:0
                                             error:nil];
}

// [root] -> main -> (a -> native, b)
static NSDictionary *
branchingStackFrames(void)
{
    return @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : jsFrame(@"a(app:///main.jsbundle:2:1)", @2),
        @"4" : jsFrame(@"b(app:///main.jsbundle:3:1)", @2),
        @"5" : @ { @"name" : @"nativeCall", @"category" : @"Native", @"parent" : @3 },
    };
}

@interface RNSentryJSHangTrackerTests : XCTestCase
@end

@implementation RNSentryJSHangTrackerTests

- (NSDictionary *)flamegraphFromTrace:(NSData *)trace
                          newestFirst:(BOOL)newestFirst
                        bundleDebugId:(nullable NSString *)bundleDebugId
{
    NSData *data = [RNSentryJSHangTracker flamegraphFromHermesTrace:trace
                                                        newestFirst:newestFirst
                                                      bundleDebugId:bundleDebugId];
    XCTAssertNotNil(data);
    if (data == nil) {
        return @{ };
    }
    NSDictionary *flamegraph = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    [self assertValidFlamegraph:flamegraph];
    return flamegraph;
}

- (void)assertValidFlamegraph:(NSDictionary *)flamegraph
{
    XCTAssertEqualObjects(flamegraph[@"version"], @"1");
    XCTAssertEqualObjects(flamegraph[@"platform"], @"javascript");
    NSArray<NSDictionary *> *frames = flamegraph[@"frames"];
    NSArray<NSDictionary *> *nodes = flamegraph[@"nodes"];
    NSArray<NSDictionary *> *trees = flamegraph[@"trees"];
    XCTAssertGreaterThan(frames.count, 0);
    XCTAssertGreaterThan(nodes.count, 0);
    XCTAssertGreaterThan(trees.count, 0);

    for (NSDictionary *frame in frames) {
        XCTAssertTrue([frame[@"filename"] length] > 0 || [frame[@"function"] length] > 0);
    }
    for (NSDictionary *node in nodes) {
        NSInteger frameId = [node[@"frame_id"] integerValue];
        XCTAssertTrue(frameId >= 0 && frameId < (NSInteger)frames.count);
        NSInteger sampleCount = [node[@"sample_count"] integerValue];
        XCTAssertGreaterThan(sampleCount, 0);
        NSInteger childrenCount = 0;
        for (NSNumber *child in node[@"children"]) {
            XCTAssertTrue(child.integerValue >= 0 && child.integerValue < (NSInteger)nodes.count);
            if (child.integerValue >= 0 && child.integerValue < (NSInteger)nodes.count) {
                childrenCount += [nodes[child.integerValue][@"sample_count"] integerValue];
            }
        }
        XCTAssertLessThanOrEqual(childrenCount, sampleCount);
    }
    for (NSDictionary *tree in trees) {
        NSArray<NSNumber *> *roots = tree[@"roots"];
        XCTAssertGreaterThan(roots.count, 0);
        for (NSNumber *root in roots) {
            XCTAssertTrue(root.integerValue >= 0 && root.integerValue < (NSInteger)nodes.count);
        }
    }
}

- (NSString *)functionOfNode:(NSNumber *)nodeIndex inFlamegraph:(NSDictionary *)flamegraph
{
    NSDictionary *node = flamegraph[@"nodes"][nodeIndex.unsignedIntegerValue];
    return flamegraph[@"frames"] [[node[@"frame_id"] unsignedIntegerValue]][@"function"];
}

- (void)testFlamegraphHasInclusiveCountsFromCallerToCallee
{
    NSData *trace = hermesTrace(branchingStackFrames(), @[
        sample(@"1000", @"7", @3), sample(@"2000", @"7", @3), sample(@"3000", @"7", @4),
        sample(@"4000", @"7", @2)
    ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray<NSDictionary *> *nodes = flamegraph[@"nodes"];
    NSArray<NSNumber *> *roots = flamegraph[@"trees"][0][@"roots"];
    XCTAssertEqual(roots.count, 1);
    NSDictionary *main = nodes[roots[0].unsignedIntegerValue];
    XCTAssertEqualObjects([self functionOfNode:roots[0] inFlamegraph:flamegraph], @"main");
    XCTAssertEqualObjects(main[@"sample_count"], @4);

    NSArray<NSNumber *> *children = main[@"children"];
    XCTAssertEqual(children.count, 2);
    XCTAssertEqualObjects([self functionOfNode:children[0] inFlamegraph:flamegraph], @"a");
    XCTAssertEqualObjects(nodes[children[0].unsignedIntegerValue][@"sample_count"], @2);
    XCTAssertEqualObjects([self functionOfNode:children[1] inFlamegraph:flamegraph], @"b");
    XCTAssertEqualObjects(nodes[children[1].unsignedIntegerValue][@"sample_count"], @1);
    XCTAssertEqual(nodes.count, 3);
}

- (void)testFlamegraphKeepsNativeFramesAndFiltersOutTheRootFrame
{
    NSData *trace = hermesTrace(branchingStackFrames(), @[ sample(@"1000", @"7", @5) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray *functions = [flamegraph[@"frames"] valueForKey:@"function"];
    XCTAssertEqualObjects(functions, (@[ @"main", @"a", @"nativeCall" ]));
    XCTAssertEqualObjects(
        flamegraph[@"frames"][2], (@{ @"function" : @"nativeCall", @"in_app" : @NO }));
    XCTAssertEqual([flamegraph[@"nodes"] count], 3);
}

- (void)testFlamegraphKeepsNativeFramesBetweenJsFrames
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : @ { @"name" : @"[Native] sort", @"category" : @"Native", @"parent" : @2 },
        @"4" : jsFrame(@"compare(app:///main.jsbundle:2:1)", @3),
    };
    NSData *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @4) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray *functions = [flamegraph[@"frames"] valueForKey:@"function"];
    XCTAssertEqualObjects(functions, (@[ @"main", @"[Native] sort", @"compare" ]));
}

- (void)testFlamegraphKeepsSamplesWithOnlyNativeFrames
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : @ { @"name" : @"[HostFunction] syncCall", @"category" : @"Native", @"parent" : @1 },
    };
    NSData *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @2) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    XCTAssertEqualObjects(
        [flamegraph[@"frames"] valueForKey:@"function"], (@[ @"[HostFunction] syncCall" ]));
    XCTAssertEqualObjects(flamegraph[@"nodes"][0][@"sample_count"], @1);
}

- (void)testEventStackLeavesOutNativeFrames
{
    NSDictionary *native = @{ @"name" : @"[Native] sort", @"category" : @"Native" };
    NSDictionary *root = @{ @"name" : @"[root]", @"category" : @"root" };

    XCTAssertNil([RNSentryJSHangTracker frameFromHermesFrame:native]);
    XCTAssertNil([RNSentryJSHangTracker frameFromHermesFrame:root]);
}

- (void)testFlamegraphSkipsSamplesWithOnlyTheRootFrame
{
    NSData *trace = hermesTrace(branchingStackFrames(),
        @[ sample(@"1000", @"7", @1), sample(@"2000", @"7", @4), sample(@"3000", @"7", @1) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray<NSNumber *> *roots = flamegraph[@"trees"][0][@"roots"];
    XCTAssertEqualObjects(flamegraph[@"nodes"][roots[0].unsignedIntegerValue][@"sample_count"], @1);
}

- (void)testFlamegraphIsNilWithOnlyRootSamples
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
    };
    NSData *trace
        = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @1), sample(@"2000", @"7", @1) ]);

    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesTrace:trace
                                                      newestFirst:NO
                                                    bundleDebugId:nil]);
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesTrace:hermesTrace(stackFrames, @[])
                                                      newestFirst:YES
                                                    bundleDebugId:nil]);
}

- (void)testFlamegraphIsNilForInvalidTrace
{
    NSData *trace = [@"not json" dataUsingEncoding:NSUTF8StringEncoding];
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesTrace:trace
                                                      newestFirst:NO
                                                    bundleDebugId:nil]);

    NSData *wrongTypes = [NSJSONSerialization dataWithJSONObject:@{ @"samples" : @"x" }
                                                         options:0
                                                           error:nil];
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesTrace:wrongTypes
                                                      newestFirst:NO
                                                    bundleDebugId:nil]);
}

- (void)testFlamegraphIsNilWhenLargerThan10MiB
{
    NSString *longName = [@"" stringByPaddingToLength:6000 withString:@"f" startingAtIndex:0];
    NSData * (^traceWithLongFrames)(NSInteger) = ^(NSInteger count) {
        NSMutableDictionary *stackFrames = [@{ @"1" : jsFrame(@"main", nil) } mutableCopy];
        NSMutableArray *samples = [NSMutableArray array];
        for (NSInteger i = 2; i < count + 2; i++) {
            NSString *frameId = [@(i) stringValue];
            stackFrames[frameId] = jsFrame([longName stringByAppendingString:frameId], @1);
            [samples addObject:sample(frameId, @"7", @(i))];
        }
        return hermesTrace(stackFrames, samples);
    };

    XCTAssertNotNil([RNSentryJSHangTracker flamegraphFromHermesTrace:traceWithLongFrames(1000)
                                                         newestFirst:NO
                                                       bundleDebugId:nil]);
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesTrace:traceWithLongFrames(2000)
                                                      newestFirst:NO
                                                    bundleDebugId:nil]);
}

- (void)testFlamegraphFromProfileKeepsOnlyTheLastWindow
{
    NSData *trace = hermesTrace(branchingStackFrames(), @[
        sample(@"1000000", @"7", @3), sample(@"1199999", @"7", @3), sample(@"1200000", @"7", @4),
        sample(@"1500000", @"7", @4)
    ]);

    NSDictionary *profileGraph = [self flamegraphFromTrace:trace newestFirst:YES bundleDebugId:nil];
    NSDictionary *fullGraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray *profileFunctions = [profileGraph[@"frames"] valueForKey:@"function"];
    XCTAssertEqualObjects(profileFunctions, (@[ @"main", @"b" ]));
    NSNumber *profileRoot = profileGraph[@"trees"][0][@"roots"][0];
    XCTAssertEqualObjects(
        profileGraph[@"nodes"][profileRoot.unsignedIntegerValue][@"sample_count"], @2);

    NSNumber *fullRoot = fullGraph[@"trees"][0][@"roots"][0];
    XCTAssertEqualObjects(fullGraph[@"nodes"][fullRoot.unsignedIntegerValue][@"sample_count"], @4);
}

- (void)testFlamegraphAttributesTheThreadOfTheEventStack
{
    NSData *trace = hermesTrace(branchingStackFrames(), @[
        sample(@"1000", @"1", @1), sample(@"2000", @"1", @3), sample(@"3000", @"2", @4),
        sample(@"4000", @"2", @1)
    ]);

    NSArray<NSDictionary *> *oldestFirstTrees = [self flamegraphFromTrace:trace
                                                              newestFirst:NO
                                                            bundleDebugId:nil][@"trees"];
    NSArray<NSDictionary *> *newestFirstTrees = [self flamegraphFromTrace:trace
                                                              newestFirst:YES
                                                            bundleDebugId:nil][@"trees"];

    XCTAssertEqual(oldestFirstTrees.count, 2);
    XCTAssertEqualObjects(oldestFirstTrees[0][@"thread_id"], @"1");
    XCTAssertEqualObjects(oldestFirstTrees[0][@"thread_attributed"], @YES);
    XCTAssertEqualObjects(oldestFirstTrees[1][@"thread_id"], @"2");
    XCTAssertNil(oldestFirstTrees[1][@"thread_attributed"]);

    XCTAssertEqual(newestFirstTrees.count, 2);
    XCTAssertNil(newestFirstTrees[0][@"thread_attributed"]);
    XCTAssertEqualObjects(newestFirstTrees[1][@"thread_id"], @"2");
    XCTAssertEqualObjects(newestFirstTrees[1][@"thread_attributed"], @YES);
}

- (void)testFlamegraphHasDebugMetaWhenBundleDebugIdIsSet
{
    NSData *trace = hermesTrace(branchingStackFrames(), @[ sample(@"1000", @"7", @3) ]);

    NSDictionary *withDebugId = [self flamegraphFromTrace:trace
                                              newestFirst:NO
                                            bundleDebugId:@"debug-id"];
    NSDictionary *withoutDebugId = [self flamegraphFromTrace:trace
                                                 newestFirst:NO
                                               bundleDebugId:nil];

    XCTAssertEqualObjects(withDebugId[@"debug_meta"], (@{
        @"images" : @[ @{
            @"type" : @"sourcemap",
            @"debug_id" : @"debug-id",
            @"code_file" : @"app:///main.jsbundle",
        } ]
    }));
    XCTAssertNil(withoutDebugId[@"debug_meta"]);
}

- (void)testFlamegraphFramesMatchEventStackFrames
{
    NSDictionary *bytecode = @{
        @"name" : @"bytecodeFn(app:///main.jsbundle)",
        @"category" : @"JavaScript",
        @"funcVirtAddr" : @"100",
        @"offset" : @"5",
    };
    NSDictionary *anonymous = @{
        @"name" : @"(app:///main.jsbundle:1:1)",
        @"category" : @"JavaScript",
        @"line" : @"10",
        @"column" : @"20",
        @"parent" : @1,
    };
    NSDictionary *stackFrames = @{ @"1" : bytecode, @"2" : anonymous };
    NSData *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @2) ]);

    NSArray<NSDictionary *> *frames = [self flamegraphFromTrace:trace
                                                    newestFirst:NO
                                                  bundleDebugId:nil][@"frames"];

    XCTAssertEqualObjects(frames[0], (@{
        @"function" : @"bytecodeFn",
        @"filename" : @"app:///main.jsbundle",
        @"abs_path" : @"app:///main.jsbundle",
        @"lineno" : @1,
        @"colno" : @106,
        @"platform" : @"javascript",
        @"in_app" : @YES,
    }));
    XCTAssertEqualObjects(frames[1], (@{
        @"filename" : @"app:///main.jsbundle",
        @"abs_path" : @"app:///main.jsbundle",
        @"lineno" : @10,
        @"colno" : @20,
        @"platform" : @"javascript",
        @"in_app" : @YES,
    }));

    NSArray<NSDictionary *> *hermesFrames = @[ bytecode, anonymous ];
    for (NSUInteger i = 0; i < hermesFrames.count; i++) {
        SentryFrame *eventFrame = [RNSentryJSHangTracker frameFromHermesFrame:hermesFrames[i]];
        XCTAssertEqualObjects(frames[i][@"function"], eventFrame.function);
        XCTAssertEqualObjects(frames[i][@"filename"], eventFrame.fileName);
        XCTAssertEqualObjects(frames[i][@"lineno"], eventFrame.lineNumber);
        XCTAssertEqualObjects(frames[i][@"colno"], eventFrame.columnNumber);
        XCTAssertEqualObjects(frames[i][@"platform"], eventFrame.platform);
        XCTAssertNil(eventFrame.inApp);
    }
}

- (void)testFlamegraphReusesFramesAcrossThreads
{
    NSData *trace = hermesTrace(branchingStackFrames(),
        @[ sample(@"1000", @"1", @3), sample(@"2000", @"2", @3), sample(@"3000", @"1", @3) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    XCTAssertEqual([flamegraph[@"frames"] count], 2);
    XCTAssertEqual([flamegraph[@"nodes"] count], 4);
    XCTAssertEqual([flamegraph[@"trees"] count], 2);
}

@end
