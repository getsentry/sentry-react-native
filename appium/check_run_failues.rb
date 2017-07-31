require 'aws-sdk'

arn = File.read('./fastlane/.aws.run.arn')
arn.strip!

client = ::Aws::DeviceFarm::Client.new

problems = client.list_unique_problems({
    arn: arn
})

problems.unique_problems.each do |up|
    raise RuntimeError, "No failed tests: #{up.inspect}" unless up.length == 2
    up[1].each do |p|
        exception = p.message.match(/crashed: EXC_/)
        raise RuntimeError, "No crash: #{p.inspect}" unless !exception.nil?
    end
end
