def parse_rn_package_json()
  rn_path = File.dirname(`node --print "require.resolve('react-native/package.json')"`)
  env_rn_path = ENV['REACT_NATIVE_NODE_MODULES_DIR']
  if env_rn_path != nil
    rn_path = env_rn_path
  end

  rn_package_json_path = File.join(rn_path, 'package.json')
  if !File.exist?(rn_package_json_path)
    raise "React Native `package.json` not found, it doesn't exist in #{rn_package_json_path}, use `REACT_NATIVE_NODE_MODULES_DIR` env variable to specify a custom location"
  end

  return JSON.parse(File.read(rn_package_json_path))
end

def get_rn_version(package)
  version = package['version'].split('.')
  result = {
    :major => version[0].to_i,
    :minor => version[1].to_i,
  }
  return result
end

def is_hermes_default(rn_version)
  return (rn_version[:major] >= 1 || (rn_version[:major] == 0 && rn_version[:minor] >= 70))
end

# before RN 0.69 Hermes was not shipped with RN
# users could use unexpected version of Hermes
def is_profiling_supported(rn_version)
  return (rn_version[:major] >= 1 || (rn_version[:major] == 0 && rn_version[:minor] >= 69))
end

# Check if we need the old Folly flags (for RN < 0.80.0)
def should_use_folly_flags(rn_version)
  return (rn_version[:major] == 0 && rn_version[:minor] < 80)
end

def is_new_hermes_runtime(rn_version)
  return (rn_version[:major] >= 1 || (rn_version[:major] == 0 && rn_version[:minor] >= 81))
end

require 'digest'
require 'fileutils'

# SHA256 checksums of `<product>.xcframework.zip` assets published in
# sentry-cocoa GitHub releases (same value as the SPM binary target checksum
# in sentry-cocoa's `Package.swift`). Register the checksum for each
# sentry-cocoa version we ship a prebuilt xcframework for.
SENTRY_COCOA_XCFRAMEWORK_CHECKSUMS = {
  '9.19.1' => {
    # `Sentry.xcframework.zip` — the static product. Its enclosing xcframework
    # name matches the framework name inside (both `Sentry`), which CocoaPods
    # requires to generate `-framework Sentry` correctly and to resolve the
    # `Sentry` module. `Sentry-Dynamic.xcframework` would ship the same
    # `Sentry.framework` inside but under a mismatched enclosing name, so
    # CocoaPods generates `-framework Sentry-Dynamic` and fails at link.
    'Sentry' => 'd6d545af17e49851cda2747b0f45cde78ce08ea37709dde5a956c6b4671224e8',
  },
}.freeze

# Ensures `<sdk_root>/ios/Vendor/<product>.xcframework` exists.
#
# On first invocation, downloads the prebuilt xcframework zip from
# sentry-cocoa's GitHub release, verifies its SHA256 checksum against
# `SENTRY_COCOA_XCFRAMEWORK_CHECKSUMS`, and extracts it. Subsequent
# invocations are no-ops.
#
# Consuming sentry-cocoa this way (vs. through Xcode's SPM integration)
# avoids the Xcode 16/26 archive bug where a signed SPM binary xcframework's
# `Signatures/*.signature` file collides during the archive step.
def ensure_sentry_xcframework(version, product = 'Sentry')
  vendor_dir = File.expand_path('../ios/Vendor', __dir__)
  target_dir = File.join(vendor_dir, "#{product}.xcframework")
  # Treat the presence of `Info.plist` inside the xcframework as the "healthy"
  # sentinel rather than just the directory existence. A directory without
  # `Info.plist` most likely came from an interrupted `unzip` and would
  # otherwise silently short-circuit re-download here.
  target_manifest = File.join(target_dir, 'Info.plist')
  return target_dir if File.file?(target_manifest)

  expected_checksum = SENTRY_COCOA_XCFRAMEWORK_CHECKSUMS.dig(version, product)
  unless expected_checksum
    raise "sentry-cocoa xcframework checksum not registered for #{product} " \
          "#{version}. Add it to SENTRY_COCOA_XCFRAMEWORK_CHECKSUMS in " \
          "packages/core/scripts/sentry_utils.rb after bumping the version."
  end

  # Wipe any stale partial extract from a previous interrupted run so we
  # always start from a clean tree.
  FileUtils.rm_rf(target_dir)
  FileUtils.mkdir_p(vendor_dir)
  zip_path = File.join(vendor_dir, "#{product}.xcframework.zip")
  url = "https://github.com/getsentry/sentry-cocoa/releases/download/" \
        "#{version}/#{product}.xcframework.zip"

  Pod::UI.puts "[Sentry] Downloading #{product} #{version} from GitHub Releases…" if defined?(Pod::UI)
  unless system('curl', '-sSfL', '-o', zip_path, url)
    raise "Failed to download #{url}"
  end

  actual_checksum = Digest::SHA256.file(zip_path).hexdigest
  unless actual_checksum == expected_checksum
    FileUtils.rm_f(zip_path)
    raise "Checksum mismatch for #{product} #{version}: expected " \
          "#{expected_checksum}, got #{actual_checksum}"
  end

  unless system('unzip', '-q', '-o', zip_path, '-d', vendor_dir)
    raise "Failed to extract #{zip_path}"
  end
  FileUtils.rm_f(zip_path)

  # Guard against a release archive whose internal layout changed (e.g. a
  # nested folder). Without this check, a wrong layout silently succeeds and
  # then fails much later during `pod install` with a confusing "framework
  # not found" error.
  unless File.file?(target_manifest)
    raise "Expected #{target_manifest} after extracting #{product}.xcframework.zip. " \
          "The sentry-cocoa release archive layout may have changed — update " \
          "the extraction logic in packages/core/scripts/sentry_utils.rb."
  end

  target_dir
end

# Returns a hash of `<xcconfig SDK name> => [slice_id, ...]` for the slice
# directories inside an xcframework bundle.
#
# Xcode's `-F <dir>` does not descend into an `.xcframework` bundle at
# search-path lookup time — it only sees `Sentry.xcframework` as a directory
# and doesn't find `Sentry.framework` inside. Callers use these groupings
# to emit SDK-conditional `FRAMEWORK_SEARCH_PATHS[sdk=…*]` xcconfig entries
# so each SDK build only sees its own slice — putting all slices under a
# single unconditional search path lets Xcode's Swift module precompiler
# stumble into an incompatible slice and fail with
# "unsupported Swift architecture".
#
# Slice-name convention is stable across the xcframeworks Apple has ever
# published:
#   ios-*-simulator      -> iphonesimulator
#   ios-*-maccatalyst    -> maccatalyst
#   ios-…                -> iphoneos
#   tvos-*-simulator     -> appletvsimulator
#   tvos-…               -> appletvos
#   watchos-*-simulator  -> watchsimulator
#   watchos-…            -> watchos
#   xros-*-simulator     -> xrsimulator
#   xros-…               -> xros
#   macos-…              -> macosx
def sentry_xcframework_slices_by_sdk(xcframework_dir)
  slice_ids = Dir.children(xcframework_dir).select do |name|
    File.directory?(File.join(xcframework_dir, name)) && name != '_CodeSignature'
  end.sort

  slice_ids.each_with_object({}) do |slice, groups|
    sdk = _sentry_sdk_for_slice(slice)
    next unless sdk # unknown platform prefix — skip rather than mis-attach
    (groups[sdk] ||= []) << slice
  end
end

def _sentry_sdk_for_slice(slice_id)
  return 'maccatalyst' if slice_id.include?('-maccatalyst')
  simulator = slice_id.end_with?('-simulator')
  case
  when slice_id.start_with?('ios-')     then simulator ? 'iphonesimulator' : 'iphoneos'
  when slice_id.start_with?('tvos-')    then simulator ? 'appletvsimulator' : 'appletvos'
  when slice_id.start_with?('watchos-') then simulator ? 'watchsimulator' : 'watchos'
  when slice_id.start_with?('xros-')    then simulator ? 'xrsimulator' : 'xros'
  when slice_id.start_with?('macos-')   then 'macosx'
  end
end
