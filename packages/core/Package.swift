// swift-tools-version: 6.0
import PackageDescription

// Swift Package Manager support for React Native's SwiftPM autolinking
// (react-native >= 0.87, where it ships as an opt-in preview). CocoaPods users
// are unaffected and keep building through `RNSentry.podspec`.
//
// React Native resolves this manifest through a symlink at
// `<app>/ios/build/generated/autolinking/libs/RNSentry`, and SwiftPM evaluates
// relative package paths against that symlink rather than `node_modules` — so
// `../../../../xcframeworks` is `<app>/ios/build/xcframeworks` (the prebuilt
// React Native artifacts) and `../../../ios` is
// `<app>/ios/build/generated/ios` (this app's codegen output). The paths are
// fixed because the symlink location is.
//
// Every target points at a single source directory rather than the package
// root: SwiftPM scans a target's whole directory for resources, so a root-level
// target picks up whatever else happens to sit next to the sources (a local
// `node_modules`, Xcode build output, `Pods/`) and fails to resolve.
//
// Keep the build settings below in explicitly typed constants. Concatenating
// them inline inside `Package(...)` is enough to make the manifest fail to
// type-check ("unable to type-check this expression in reasonable time").

// `RCT_NEW_ARCH_ENABLED`: the SwiftPM path exists only on React Native 0.87+,
// where the New Architecture is the only architecture.
// `SENTRY_PROFILING_SUPPORTED` / `NEW_HERMES_RUNTIME`: both gates
// (`RNSentry.podspec` → `scripts/sentry_utils.rb`) are satisfied by every
// React Native version that can consume this manifest.
// `RN_SENTRY_SWIFTPM`: tells `ios/RNSentrySwiftBridge.h` to import the Swift
// sources as their own module instead of the pod's `RNSentry-Swift.h`.
let defines: [(name: String, value: String?)] = [
    ("RCT_NEW_ARCH_ENABLED", nil),
    ("SENTRY_PROFILING_SUPPORTED", "1"),
    ("NEW_HERMES_RUNTIME", nil),
    ("RN_SENTRY_SWIFTPM", "1")
]

let cDefines: [CSetting] = defines.map { .define($0.name, to: $0.value) }
let cxxDefines: [CXXSetting] = defines.map { .define($0.name, to: $0.value) }

// DEBUG/NDEBUG must match the prebuilt React.framework's configuration-gated
// C++ ABI, or the Release link fails on anything that includes React headers.
let configurationDefines: [CXXSetting] = [
    .define("DEBUG", .when(configuration: .debug)),
    .define("NDEBUG", .when(configuration: .release))
]

// Unlike CocoaPods, SwiftPM has no header maps, so the quoted cross-directory
// imports inside `ios/` need explicit search paths. Keep in sync when adding a
// directory that holds headers.
let iosCHeaderPaths: [CSetting] = [.headerSearchPath("."), .headerSearchPath("Replay")]
let iosCxxHeaderPaths: [CXXSetting] = [.headerSearchPath("."), .headerSearchPath("Replay")]

let iosCSettings: [CSetting] = iosCHeaderPaths + cDefines
let iosCxxSettings: [CXXSetting] = iosCxxHeaderPaths + cxxDefines + configurationDefines
let cppCxxSettings: [CXXSetting] = cxxDefines + configurationDefines

// React Native's own headers, its bundled third-party headers (folly, glog,
// hermes, ...), and this app's codegen output. All three are plain product
// dependencies — React Native's SwiftPM integration serves headers through the
// package graph instead of search paths.
let reactNativeHeaderProducts: [Target.Dependency] = [
    .product(name: "ReactHeaders", package: "ReactNative"),
    .product(name: "ReactNativeHeaders", package: "ReactNative"),
    .product(name: "ReactNativeDependenciesHeaders", package: "ReactNative"),
    .product(name: "ReactAppHeaders", package: "React-GeneratedCode")
]

// sentry-cocoa is consumed as the single prebuilt `Sentry.xcframework` rather
// than as a package dependency. Its manifest declares a binary target per
// distribution variant (dynamic, ARM64e, without UIKit, ...) and SwiftPM
// downloads every artifact of a resolved package, not only the ones a product
// needs — 2.9 GB for the one 339 MB variant used here, and seven chances for a
// failed download to break the build.
//
// `scripts/update-cocoa.sh` keeps the version and the checksum in step with
// `sentry_cocoa_version` in RNSentry.podspec. The checksum is the SHA256 of the
// archive, which is what both `pod install` and SwiftPM verify.
let sentryCocoaVersion = "9.29.0"
let sentryCocoaChecksum = "63fe5a7258097fded9ef485bbb1d8e80e1e91d419ee6d8a6ad405454b5b50fef"

let sentryCocoa: Target.Dependency = "Sentry"

let rnSentryDependencies: [Target.Dependency] =
    ["RNSentrySwift", "RNSentryCpp", sentryCocoa] + reactNativeHeaderProducts

let package = Package(
    name: "RNSentry",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RNSentry", targets: ["RNSentry"])
    ],
    dependencies: [
        .package(name: "ReactNative", path: "../../../../xcframeworks"),
        .package(name: "React-GeneratedCode", path: "../../../ios")
    ],
    targets: [
        .binaryTarget(
            name: "Sentry",
            url: "https://github.com/getsentry/sentry-cocoa/releases/download/"
                + "\(sentryCocoaVersion)/Sentry.xcframework.zip",
            checksum: sentryCocoaChecksum
        ),
        // SwiftPM cannot mix Swift with Objective-C(++) in one target, so the
        // Swift bridge over sentry-cocoa's `SentrySDK.internal.*` compiles on
        // its own. `.m`/`.mm` callers reach it through
        // `ios/RNSentrySwiftBridge.h`, which picks the generated header of
        // whichever build system is in use.
        .target(
            name: "RNSentrySwift",
            dependencies: [sentryCocoa],
            path: "ios/Swift",
            // Matches `s.swift_versions` in the podspec. A swift-tools-version
            // of 6.0 would otherwise compile these sources in the Swift 6
            // language mode, which the pod never does.
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        // Platform-agnostic C++ shared with Android, which compiles it through
        // `android/CMakeLists.txt` instead. `ios/RNSentry.mm` includes these
        // headers by relative path, so this target only has to compile and link
        // them.
        .target(
            name: "RNSentryCpp",
            dependencies: reactNativeHeaderProducts,
            path: "cpp",
            publicHeadersPath: ".",
            cxxSettings: cppCxxSettings
        ),
        .target(
            name: "RNSentry",
            dependencies: rnSentryDependencies,
            path: "ios",
            exclude: [
                "AGENTS.md",
                "RNSentry.xcodeproj",
                "Swift"
            ],
            publicHeadersPath: "include",
            cSettings: iosCSettings,
            cxxSettings: iosCxxSettings,
            linkerSettings: [
                .linkedFramework("Foundation"),
                .linkedFramework("UIKit"),
                .linkedFramework("QuartzCore"),
                // The `Sentry` product in sentry-cocoa's own manifest pairs the
                // binary target with an empty target that carries this setting;
                // the static library needs the C++ runtime.
                .linkedLibrary("c++")
            ]
        )
    ],
    cxxLanguageStandard: .cxx20
)
