require_relative './scripts/sentry_utils.rb'
require 'json'
version = JSON.parse(File.read('package.json'))["version"]

rn_package = parse_rn_package_json()
rn_version = get_rn_version(rn_package)
is_hermes_default = is_hermes_default(rn_version)
is_profiling_supported = is_profiling_supported(rn_version)

folly_flags = ' -DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1'
folly_compiler_flags = folly_flags + ' ' + '-Wno-comma -Wno-shorten-64-to-32'

is_new_arch_enabled = ENV["RCT_NEW_ARCH_ENABLED"] == "1"
is_using_hermes = (ENV['USE_HERMES'] == nil && is_hermes_default) || ENV['USE_HERMES'] == '1'
new_arch_enabled_flag = (is_new_arch_enabled ? folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED" : "")
sentry_profiling_supported_flag = (is_profiling_supported ? " -DSENTRY_PROFILING_SUPPORTED=1" : "")
other_cflags = "$(inherited)" + new_arch_enabled_flag + sentry_profiling_supported_flag

Pod::Spec.new do |s|
  s.name           = 'RNSentry'
  s.version        = version
  s.license        = 'MIT'
  s.summary        = 'Official Sentry SDK for react-native'
  s.author         = 'Sentry'
  s.homepage       = "https://github.com/getsentry/sentry-react-native"
  s.source         = { :git => 'https://github.com/getsentry/sentry-react-native.git', :tag => "#{s.version}"}

  s.ios.deployment_target = "11.0"
  s.osx.deployment_target = "10.13"
  s.tvos.deployment_target = "11.0"
  s.visionos.deployment_target = "1.0" if s.respond_to?(:visionos)

  s.preserve_paths = '*.js'

  s.source_files = 'ios/**/*.{h,m,mm}'
  s.public_header_files = 'ios/RNSentry.h'

  s.compiler_flags = other_cflags

  s.dependency 'Sentry/HybridSDK', '8.49.2'

  if defined? install_modules_dependencies
    # Default React Native dependencies for 0.71 and above (new and legacy architecture)
    install_modules_dependencies(s)
  else
    s.dependency 'React-Core'

    if is_new_arch_enabled then
      # New Architecture on React Native 0.70 and older
      s.pod_target_xcconfig = {
          "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }

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
end
