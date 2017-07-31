create-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/ wheelhouse/ requirements.txt conftest.py

install:
	cd example; yarn install

copy-local-files-to-example:
	rm -rf example/node_modules/react-native-sentry/lib/*
	rm -rf example/node_modules/react-native-sentry/ios/*
	rm -rf example/node_modules/react-native-sentry/android/*
	cp -r ../lib/* example/node_modules/react-native-sentry/lib/
	cp -r ../ios/* example/node_modules/react-native-sentry/ios/
	cp -r ../android/* example/node_modules/react-native-sentry/android/

test: create-test-bundle install copy-local-files-to-example
	fastlane build_for_device_farm --verbose
	fastlane aws_ios_upload_and_run --verbose
	ruby check_run_failues.rb

local-test:
	fastlane build_for_local_appium
	pytest -vv tests/
