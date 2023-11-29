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
