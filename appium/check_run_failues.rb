require 'aws-sdk'
require 'open-uri'

arn = File.read('./fastlane/.aws.run.arn')
arn.strip!

@client = ::Aws::DeviceFarm::Client.new

@problems = @client.list_unique_problems({
    arn: arn
})


def android_check
    @problems.unique_problems.each do |up|
        raise RuntimeError, "No failed tests: #{up.inspect}" unless up.length == 2
        up[1].each do |p|
            if p.problems[0].test.name == 'test_throw_error'
                artifacts = @client.list_artifacts({
                    type: "FILE",
                    arn: p.problems[0].test.arn
                })
                artifacts.artifacts.each do |a|
                    if a.name == 'Logcat'
                        content = open(a.url).read
                        raise RuntimeError, "Missing value raven: #{p.inspect}" unless content.scan(/Raven about to send:/).size == 1
                        raise RuntimeError, "Missing value: #{p.inspect}" unless content.scan(/value: 'Sentry: Test throw error'/).size == 1
                    end
                end
            end
            if p.problems[0].test.name == 'test_native_crash'
                artifacts = @client.list_artifacts({
                    type: "FILE",
                    arn: p.problems[0].test.arn
                })
                artifacts.artifacts.each do |a|
                    if a.name == 'Logcat'
                        content = open(a.url).read
                        raise RuntimeError, "Missing native crash: #{p.inspect}" unless content.scan(/java.lang.RuntimeException: TEST - Sentry Client Crash/).size == 1
                    end
                end
            end
        end
    end
end

def ios_check
    @problems.unique_problems.each do |up|
        raise RuntimeError, "No failed tests: #{up.inspect}" unless up.length == 2
        up[1].each do |p|
            if p.problems[0].test.name == 'test_throw_error'
                artifacts = @client.list_artifacts({
                    type: "FILE",
                    arn: p.problems[0].test.arn
                })
                artifacts.artifacts.each do |a|
                    if a.name == 'Syslog'
                        content = open(a.url).read
                        raise RuntimeError, "No JSON SENT: #{p.inspect}" unless content.scan(/Sentry - Verbose:: Sending JSON/).size == 1
                        raise RuntimeError, "Wrong exception value: #{p.inspect}" unless content.scan(/"value" : "Sentry: Test throw error"/).size == 1
                        raise RuntimeError, "No javascript frames: #{p.inspect}" unless content.scan(/"platform" : "javascript"/).size >= 1
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
end


if ENV['ANDROID'] == '1'
    android_check
else
    ios_check
end
