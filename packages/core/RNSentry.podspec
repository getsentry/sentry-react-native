require_relative './scripts/sentry_utils.rb'
require 'json'
version = JSON.parse(File.read('package.json'))["version"]

rn_package = parse_rn_package_json()
rn_version = get_rn_version(rn_package)
is_hermes_default = is_hermes_default(rn_version)
is_profiling_supported = is_profiling_supported(rn_version)
is_new_hermes_runtime = is_new_hermes_runtime(rn_version)

# Use different Folly configuration for RN 0.80.0+
if should_use_folly_flags(rn_version)
  # For older RN versions, keep the original Folly configuration
  folly_flags = ' -DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1'
  folly_compiler_flags = folly_flags + ' ' + '-Wno-comma -Wno-shorten-64-to-32'
else
  # For RN 0.80+, don't use the incompatible Folly flags
  folly_compiler_flags = ''
end

is_new_arch_enabled = ENV["RCT_NEW_ARCH_ENABLED"] == "1"
is_using_hermes = (ENV['USE_HERMES'] == nil && is_hermes_default) || ENV['USE_HERMES'] == '1'
new_arch_enabled_flag = (is_new_arch_enabled ? folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED" : "")
sentry_profiling_supported_flag = (is_profiling_supported ? " -DSENTRY_PROFILING_SUPPORTED=1" : "")
new_hermes_runtime_flag = (is_new_hermes_runtime ? " -DNEW_HERMES_RUNTIME" : "")
other_cflags = "$(inherited)" + new_arch_enabled_flag + sentry_profiling_supported_flag + new_hermes_runtime_flag

Pod::Spec.new do |s|
  s.name           = 'RNSentry'
  s.version        = version
  s.license        = 'MIT'
  s.summary        = 'Official Sentry SDK for react-native'
  s.author         = 'Sentry'
  s.homepage       = "https://github.com/getsentry/sentry-react-native"
  s.source         = { :git => 'https://github.com/getsentry/sentry-react-native.git', :tag => "#{s.version}"}

  s.ios.deployment_target = "12.0"
  s.osx.deployment_target = "10.13"
  s.tvos.deployment_target = "11.0"
  s.visionos.deployment_target = "1.0" if s.respond_to?(:visionos)

  s.preserve_paths = '*.js'

  # `cpp/` holds platform-agnostic C++ used by both iOS and Android. On iOS it
  # is pulled in here; on Android it is compiled by the dedicated CMake target
  # in `android/CMakeLists.txt`. The files are guarded with
  # `RCT_NEW_ARCH_ENABLED` so they compile to empty TUs on Old Arch.
  s.source_files = 'ios/**/*.{h,m,mm}', 'cpp/**/*.{h,cpp}'
  s.exclude_files = 'ios/Vendor/**/*'
  s.public_header_files = 'ios/RNSentry.h', 'ios/RNSentrySDK.h', 'ios/RNSentryStart.h', 'ios/RNSentryVersion.h', 'ios/RNSentryBreadcrumb.h', 'ios/RNSentryReplay.h', 'ios/RNSentryReplayBreadcrumbConverter.h', 'ios/Replay/RNSentryReplayMask.h', 'ios/Replay/RNSentryReplayUnmask.h', 'ios/RNSentryTimeToDisplay.h'

  s.compiler_flags = other_cflags

  pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  sentry_cocoa_version = '9.19.1'

  # Consume sentry-cocoa as a prebuilt `Sentry.xcframework` by default.
  #
  # The xcframework is downloaded from sentry-cocoa's GitHub Release,
  # SHA256-verified, and cached under `ios/Vendor/`. CocoaPods then links it
  # via `s.vendored_frameworks`. This avoids compiling sentry-cocoa from
  # source (fast install) and sidesteps the Xcode 16/26 archive bug that
  # affects the same xcframework when consumed through Xcode's SPM
  # integration (`Signatures/*.signature` collision during archive) — the
  # CocoaPods embed path is a different pipeline and is not affected.
  #
  # Set `SENTRY_USE_XCFRAMEWORK=0` to fall back to the source-built
  # `Sentry` CocoaPod (e.g. for offline builds behind a restrictive proxy).
  #
  # `SENTRY_USE_SPM` was the name in earlier drafts of this PR; honor it as a
  # deprecated alias so CI or local envs still exporting `SENTRY_USE_SPM=0`
  # don't silently take the new xcframework path.
  env_use_xcframework = ENV['SENTRY_USE_XCFRAMEWORK']
  if env_use_xcframework.nil? && !ENV['SENTRY_USE_SPM'].nil?
    Pod::UI.warn '[Sentry] SENTRY_USE_SPM is deprecated; use SENTRY_USE_XCFRAMEWORK instead.' if defined?(Pod::UI)
    env_use_xcframework = ENV['SENTRY_USE_SPM']
  end
  use_xcframework = case env_use_xcframework
                    when '0' then false
                    else true
                    end

  if use_xcframework
    ensure_sentry_xcframework(sentry_cocoa_version, 'Sentry')
    s.vendored_frameworks = 'ios/Vendor/Sentry.xcframework'
    # `s.vendored_frameworks` alone doesn't always propagate a framework
    # search path to the pod's own compile phase for a vendored xcframework,
    # so RNSentry.mm fails to resolve `#import <Sentry/…>`. Add the search
    # path explicitly — `${PODS_TARGET_SRCROOT}` resolves to the pod's
    # source directory (i.e. `packages/core/`) at build time.
    pod_target_xcconfig['FRAMEWORK_SEARCH_PATHS'] =
      '$(inherited) "${PODS_TARGET_SRCROOT}/ios/Vendor"'
  else
    s.dependency 'Sentry', sentry_cocoa_version
  end

  if defined? install_modules_dependencies
    # Default React Native dependencies for 0.71 and above (new and legacy architecture)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'

    if is_new_arch_enabled then
      # New Architecture on React Native 0.70 and older
      pod_target_xcconfig.merge!({
          "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      })

      s.dependency "React-RCTFabric" # Required for Fabric Components (like RCTViewComponentView)
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  end

  if is_using_hermes then
    s.dependency 'React-hermes'
    s.dependency 'hermes-engine'
  end

  s.pod_target_xcconfig = pod_target_xcconfig
end
