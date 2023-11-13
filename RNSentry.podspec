require 'json'
version = JSON.parse(File.read('package.json'))["version"]

folly_flags = ' -DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1'
folly_compiler_flags = folly_flags + ' ' + '-Wno-comma -Wno-shorten-64-to-32'

is_new_arch_enabled = ENV["RCT_NEW_ARCH_ENABLED"] == "1"
new_arch_enabled_flag = (is_new_arch_enabled ? folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED" : "")
other_cflags = "$(inherited)" + new_arch_enabled_flag

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

  s.preserve_paths = '*.js'

  s.dependency 'React-Core'
  s.dependency 'Sentry/HybridSDK', '8.15.2'

  s.source_files = 'ios/**/*.{h,mm}'
  s.public_header_files = 'ios/RNSentry.h'

  s.compiler_flags = other_cflags
  # This guard prevent to install the dependencies when we run `pod install` in the old architecture.
  if is_new_arch_enabled then
    s.pod_target_xcconfig    = {
        "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
        "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
    }

    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
    s.dependency "RCTRequired"
    s.dependency "RCTTypeSafety"
    s.dependency "ReactCommon/turbomodule/core"
  end
end
