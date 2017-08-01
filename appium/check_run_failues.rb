require 'aws-sdk'
require 'open-uri'

arn = File.read('./fastlane/.aws.run.arn')
arn.strip!

client = ::Aws::DeviceFarm::Client.new

problems = client.list_unique_problems({
    arn: arn
})

problems.unique_problems.each do |up|
    raise RuntimeError, "No failed tests: #{up.inspect}" unless up.length == 2
    up[1].each do |p|

        if p.problems[0].test.name == 'test_throw_error'
            artifacts = client.list_artifacts({
                type: "FILE",
                arn: p.problems[0].test.arn
            })
            artifacts.artifacts.each do |a|
                if a.name == 'Syslog'
                    content = open(a.url).read
                    exception = content.scan(/Sentry - Verbose:: Sending JSON/).size
                    raise RuntimeError, "No JSON SENT: #{p.inspect}" unless exception == 1
                    exception = nil
                end
            end
        end
        if p.problems[0].test.name == 'test_native_crash'
            exception = p.message.match(/crashed: EXC_/)
            raise RuntimeError, "No crash: #{p.inspect}" unless !exception.nil?
            exception = nil
        end
    end
end
