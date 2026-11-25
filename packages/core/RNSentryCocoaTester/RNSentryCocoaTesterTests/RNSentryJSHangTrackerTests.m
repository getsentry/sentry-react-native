#import "RNSentryJSHangTracker+Test.h"
#import "SentrySDKWrapper.h"
#import <OCMock/OCMock.h>
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

static NSDictionary *
hermesTrace(NSDictionary *stackFrames, NSArray *samples)
{
    return @{
        @"traceEvents" : @[],
        @"stackFrames" : stackFrames,
        @"samples" : samples,
    };
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

- (NSDictionary *)flamegraphFromTrace:(NSDictionary *)trace
                          newestFirst:(BOOL)newestFirst
                        bundleDebugId:(nullable NSString *)bundleDebugId
{
    NSData *data = [RNSentryJSHangTracker flamegraphFromHermesProfile:trace
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
    NSMutableSet<NSNumber *> *visited = [NSMutableSet set];
    for (NSDictionary *tree in trees) {
        NSArray<NSNumber *> *roots = tree[@"roots"];
        XCTAssertGreaterThan(roots.count, 0);
        NSMutableArray<NSNumber *> *pending = [NSMutableArray array];
        for (NSNumber *root in roots) {
            XCTAssertTrue(root.integerValue >= 0 && root.integerValue < (NSInteger)nodes.count);
            [pending addObject:root];
        }
        while (pending.count > 0) {
            NSNumber *nodeIndex = pending.lastObject;
            [pending removeLastObject];
            if ([visited containsObject:nodeIndex]) {
                XCTFail(@"Node %@ is shared or part of a cycle", nodeIndex);
                continue;
            }
            [visited addObject:nodeIndex];
            for (NSNumber *child in nodes[nodeIndex.unsignedIntegerValue][@"children"]) {
                if (child.integerValue >= 0 && child.integerValue < (NSInteger)nodes.count) {
                    [pending addObject:child];
                }
            }
        }
    }
    XCTAssertEqual(visited.count, nodes.count, @"Every node must belong to exactly one tree");
}

- (NSString *)functionOfNode:(NSNumber *)nodeIndex inFlamegraph:(NSDictionary *)flamegraph
{
    NSDictionary *node = flamegraph[@"nodes"][nodeIndex.unsignedIntegerValue];
    return flamegraph[@"frames"] [[node[@"frame_id"] unsignedIntegerValue]][@"function"];
}

- (void)testFlamegraphHasInclusiveCountsFromCallerToCallee
{
    NSDictionary *trace = hermesTrace(branchingStackFrames(), @[
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
    NSDictionary *trace = hermesTrace(branchingStackFrames(), @[ sample(@"1000", @"7", @5) ]);

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
    NSDictionary *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @4) ]);

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
    NSDictionary *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @2) ]);

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
    NSDictionary *trace = hermesTrace(branchingStackFrames(),
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
    NSDictionary *trace
        = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @1), sample(@"2000", @"7", @1) ]);

    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesProfile:trace
                                                        newestFirst:NO
                                                      bundleDebugId:nil]);
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesProfile:hermesTrace(stackFrames, @[])
                                                        newestFirst:YES
                                                      bundleDebugId:nil]);
}

- (void)testFlamegraphIsNilForInvalidProfile
{
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesProfile:nil
                                                        newestFirst:NO
                                                      bundleDebugId:nil]);

    NSDictionary *wrongTypes = @{ @"samples" : @"x" };
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesProfile:wrongTypes
                                                        newestFirst:NO
                                                      bundleDebugId:nil]);
}

- (void)testFlamegraphIsNilWhenLargerThan10MiB
{
    NSString *longName = [@"" stringByPaddingToLength:6000 withString:@"f" startingAtIndex:0];
    NSDictionary * (^traceWithLongFrames)(NSInteger) = ^(NSInteger count) {
        NSMutableDictionary *stackFrames = [@{ @"1" : jsFrame(@"main", nil) } mutableCopy];
        NSMutableArray *samples = [NSMutableArray array];
        for (NSInteger i = 2; i < count + 2; i++) {
            NSString *frameId = [@(i) stringValue];
            stackFrames[frameId] = jsFrame([longName stringByAppendingString:frameId], @1);
            [samples addObject:sample(frameId, @"7", @(i))];
        }
        return hermesTrace(stackFrames, samples);
    };

    XCTAssertNotNil([RNSentryJSHangTracker flamegraphFromHermesProfile:traceWithLongFrames(1000)
                                                           newestFirst:NO
                                                         bundleDebugId:nil]);
    XCTAssertNil([RNSentryJSHangTracker flamegraphFromHermesProfile:traceWithLongFrames(2000)
                                                        newestFirst:NO
                                                      bundleDebugId:nil]);
}

- (void)testFlamegraphFromProfileKeepsOnlyTheLastWindow
{
    NSDictionary *trace = hermesTrace(branchingStackFrames(), @[
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
    NSDictionary *trace = hermesTrace(branchingStackFrames(), @[
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
    NSDictionary *trace = hermesTrace(branchingStackFrames(), @[ sample(@"1000", @"7", @3) ]);

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
    NSDictionary *trace = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @2) ]);

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

- (void)testFlamegraphDeduplicatesFramesByContent
{
    // Hermes gives `work` its own frame id under each caller.
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : jsFrame(@"a(app:///main.jsbundle:2:1)", @2),
        @"4" : jsFrame(@"b(app:///main.jsbundle:3:1)", @2),
        @"5" : jsFrame(@"work(app:///main.jsbundle:4:1)", @3),
        @"6" : jsFrame(@"work(app:///main.jsbundle:4:1)", @4),
    };
    NSDictionary *trace
        = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @5), sample(@"2000", @"7", @6) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray *functions = [flamegraph[@"frames"] valueForKey:@"function"];
    XCTAssertEqualObjects(functions, (@[ @"main", @"a", @"work", @"b" ]));
    XCTAssertEqual([flamegraph[@"nodes"] count], 5);
}

- (void)testFlamegraphMergesSiblingNodesWithTheSameFrameContent
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : jsFrame(@"work(app:///main.jsbundle:4:1)", @2),
        @"4" : jsFrame(@"work(app:///main.jsbundle:4:1)", @2),
    };
    NSDictionary *trace
        = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @3), sample(@"2000", @"7", @4) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray<NSDictionary *> *nodes = flamegraph[@"nodes"];
    XCTAssertEqual(nodes.count, 2);
    XCTAssertEqualObjects(nodes[0][@"children"], (@[ @1 ]));
    XCTAssertEqualObjects(nodes[1][@"sample_count"], @2);
}

- (void)testFlamegraphKeepsRecursiveCallsAsSeparateNodesWithOneFrame
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : jsFrame(@"recurse(app:///main.jsbundle:2:1)", @2),
        @"4" : jsFrame(@"recurse(app:///main.jsbundle:2:1)", @3),
    };
    NSDictionary *trace = hermesTrace(stackFrames,
        @[ sample(@"1000", @"7", @4), sample(@"2000", @"7", @4), sample(@"3000", @"7", @3) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    XCTAssertEqualObjects(
        [flamegraph[@"frames"] valueForKey:@"function"], (@[ @"main", @"recurse" ]));
    NSArray<NSDictionary *> *nodes = flamegraph[@"nodes"];
    XCTAssertEqual(nodes.count, 3);
    NSDictionary *outer = nodes [[nodes[0][@"children"][0] unsignedIntegerValue]];
    NSDictionary *inner = nodes [[outer[@"children"][0] unsignedIntegerValue]];
    XCTAssertEqualObjects(outer[@"frame_id"], inner[@"frame_id"]);
    XCTAssertEqualObjects(nodes[0][@"sample_count"], @3);
    XCTAssertEqualObjects(outer[@"sample_count"], @3);
    XCTAssertEqualObjects(inner[@"sample_count"], @2);
}

- (void)testFlamegraphKeepsFramesWithTheSameFunctionAndDifferentColumnsApart
{
    NSMutableDictionary *firstWork = [jsFrame(@"work(app:///main.jsbundle:4:1)", @2) mutableCopy];
    NSMutableDictionary *secondWork = [jsFrame(@"work(app:///main.jsbundle:4:1)", @2) mutableCopy];
    secondWork[@"column"] = @"30";
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : firstWork,
        @"4" : secondWork,
    };
    NSDictionary *trace
        = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @3), sample(@"2000", @"7", @4) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    NSArray<NSDictionary *> *frames = flamegraph[@"frames"];
    XCTAssertEqualObjects([frames valueForKey:@"function"], (@[ @"main", @"work", @"work" ]));
    XCTAssertEqualObjects([frames valueForKey:@"colno"], (@[ @20, @20, @30 ]));
    NSArray<NSDictionary *> *nodes = flamegraph[@"nodes"];
    XCTAssertEqual([nodes[0][@"children"] count], 2);
    XCTAssertEqual(nodes.count, 3);
}

- (void)testFlamegraphReusesFramesAcrossThreads
{
    NSDictionary *trace = hermesTrace(branchingStackFrames(),
        @[ sample(@"1000", @"1", @3), sample(@"2000", @"2", @3), sample(@"3000", @"1", @3) ]);

    NSDictionary *flamegraph = [self flamegraphFromTrace:trace newestFirst:NO bundleDebugId:nil];

    XCTAssertEqual([flamegraph[@"frames"] count], 2);
    XCTAssertEqual([flamegraph[@"nodes"] count], 4);
    XCTAssertEqual([flamegraph[@"trees"] count], 2);
}

@end

static NSDictionary *
jsHangTrace(void)
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : jsFrame(@"main(app:///main.jsbundle:1:1)", @1),
        @"3" : jsFrame(@"work(app:///main.jsbundle:2:1)", @2),
    };
    return hermesTrace(stackFrames, @[ sample(@"1000", @"7", @3), sample(@"2000", @"7", @3) ]);
}

@interface RNSentryJSHangTrackerCaptureTests : XCTestCase
@property (nonatomic, strong) id sdkWrapperMock;
@end

@implementation RNSentryJSHangTrackerCaptureTests

- (void)setUp
{
    [super setUp];
    self.sdkWrapperMock = OCMClassMock([SentrySDKWrapper class]);
}

- (void)tearDown
{
    [self.sdkWrapperMock stopMocking];
    [super tearDown];
}

- (void)captureHangWithProfile:(nullable NSDictionary *)profile attachFlamegraph:(BOOL)attach
{
    [RNSentryJSHangTracker captureHangWithProfile:profile
                                      newestFirst:NO
                                timeoutIntervalMs:2000
                                    bundleDebugId:nil
                                 attachFlamegraph:attach];
}

- (void)expectCaptureWithoutAttachment
{
    OCMExpect(ClassMethod([self.sdkWrapperMock captureEvent:[OCMArg any]]));
    OCMReject(ClassMethod([self.sdkWrapperMock captureEvent:[OCMArg any] attachment:[OCMArg any]]));
}

- (void)testCaptureAttachesTheFlamegraphWhenEnabled
{
    __block SentryAttachment *attachment = nil;
    OCMExpect(ClassMethod(
        [self.sdkWrapperMock captureEvent:[OCMArg any]
                               attachment:[OCMArg checkWithBlock:^BOOL(SentryAttachment *value) {
                                   attachment = value;
                                   return YES;
                               }]]));
    OCMReject(ClassMethod([self.sdkWrapperMock captureEvent:[OCMArg any]]));

    [self captureHangWithProfile:jsHangTrace() attachFlamegraph:YES];

    OCMVerifyAll(self.sdkWrapperMock);
    XCTAssertEqualObjects(attachment.filename, @"flamegraph.json");
    XCTAssertEqualObjects(attachment.contentType, @"application/json");
    XCTAssertEqual(attachment.attachmentType, kSentryAttachmentTypeFlamegraph);
    NSDictionary *flamegraph = [NSJSONSerialization JSONObjectWithData:attachment.data
                                                               options:0
                                                                 error:nil];
    XCTAssertEqualObjects(flamegraph[@"platform"], @"javascript");
}

- (void)testCaptureHasNoAttachmentWhenDisabled
{
    [self expectCaptureWithoutAttachment];

    [self captureHangWithProfile:jsHangTrace() attachFlamegraph:NO];

    OCMVerifyAll(self.sdkWrapperMock);
}

- (void)testCaptureHasNoAttachmentForAnInvalidProfile
{
    [self expectCaptureWithoutAttachment];

    [self captureHangWithProfile:@{ @"samples" : @"x" } attachFlamegraph:YES];

    OCMVerifyAll(self.sdkWrapperMock);
}

- (void)testCaptureHasNoAttachmentWhenTheFlamegraphIsLargerThan10MiB
{
    NSString *longName = [@"" stringByPaddingToLength:6000 withString:@"f" startingAtIndex:0];
    NSMutableDictionary *stackFrames = [@{ @"1" : jsFrame(@"main", nil) } mutableCopy];
    NSMutableArray *samples = [NSMutableArray array];
    for (NSInteger i = 2; i < 2002; i++) {
        NSString *frameId = [@(i) stringValue];
        stackFrames[frameId] = jsFrame([longName stringByAppendingString:frameId], @1);
        [samples addObject:sample(frameId, @"7", @(i))];
    }
    [self expectCaptureWithoutAttachment];

    [self captureHangWithProfile:hermesTrace(stackFrames, samples) attachFlamegraph:YES];

    OCMVerifyAll(self.sdkWrapperMock);
}

- (void)testCaptureHasNoAttachmentWhenTheEventHasNoJsFrames
{
    NSDictionary *stackFrames = @{
        @"1" : @ { @"name" : @"[root]", @"category" : @"root" },
        @"2" : @ { @"name" : @"[Native] jsonStringify", @"category" : @"Native", @"parent" : @1 },
    };
    NSDictionary *profile = hermesTrace(stackFrames, @[ sample(@"1000", @"7", @2) ]);
    XCTAssertNotNil([RNSentryJSHangTracker flamegraphFromHermesProfile:profile
                                                           newestFirst:NO
                                                         bundleDebugId:nil]);
    __block SentryEvent *event = nil;
    OCMExpect(ClassMethod([self.sdkWrapperMock captureEvent:[OCMArg checkWithBlock:^BOOL(id value) {
        event = value;
        return YES;
    }]]));
    OCMReject(ClassMethod([self.sdkWrapperMock captureEvent:[OCMArg any] attachment:[OCMArg any]]));

    [self captureHangWithProfile:profile attachFlamegraph:YES];

    OCMVerifyAll(self.sdkWrapperMock);
    XCTAssertNil(event.exceptions.firstObject.stacktrace);
}

@end

@interface RNSentryJSHangTrackerScopeTests : XCTestCase
@end

@implementation RNSentryJSHangTrackerScopeTests

- (void)tearDown
{
    [SentrySDK close];
    [super tearDown];
}

- (void)testCapturedFlamegraphDoesNotStayOnTheScope
{
    [SentrySDK startWithConfigureOptions:^(
        SentryOptions *options) { options.dsn = @"https://abcd@efgh.ingest.sentry.io/123456"; }];

    [RNSentryJSHangTracker captureHangWithProfile:jsHangTrace()
                                      newestFirst:NO
                                timeoutIntervalMs:2000
                                    bundleDebugId:nil
                                 attachFlamegraph:YES];

    __block NSArray *attachments = nil;
    [SentrySDKWrapper
        configureScope:^(SentryScope *scope) { attachments = [scope valueForKey:@"attachments"]; }];
    XCTAssertNotNil(attachments);
    XCTAssertEqual(attachments.count, 0);
}

@end
