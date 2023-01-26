require "json"

package = JSON.parse(File.read(File.join(__dir__, "../package.json")))

Pod::Spec.new do |s|
  s.name            = "AppTurboModules"
  s.version         = package["version"]
  s.summary         = 'Example Cpp TurboModule'
  s.description     = package["description"]
  s.homepage        = 'http://www.github.com/getsentry/sentry-react-native'
  s.license         = 'MIT'
  s.platforms       = { :ios => "12.4" }
  s.author          = 'Sentry'
  s.source          = { :git => package["repository"], :tag => "#{s.version}" }
  s.source_files    = "**/*.{h,cpp}"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
  }
  install_modules_dependencies(s)
end
