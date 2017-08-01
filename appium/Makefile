create-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/test_ios.py wheelhouse/ requirements.txt conftest.py

create-android-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/test_android.py wheelhouse/ requirements.txt conftest.py

install:
	cd example; yarn install

copy-local-files-to-example:
	rm -rf example/node_modules/react-native-sentry/lib/*
	find example/node_modules/react-native-sentry/ios -name 'RN*.[h|m]' -exec rm {} \;
	rm -rf example/node_modules/react-native-sentry/ios/Sentry/Sources/Sentry/*
	rm -rf example/node_modules/react-native-sentry/android/*
	cp -r ../lib/* example/node_modules/react-native-sentry/lib/
	find ../ios -name 'RN*.[h|m]' -exec cp {} example/node_modules/react-native-sentry/ios/ \;
	cp -r ../android/* example/node_modules/react-native-sentry/android/
	cp -r ../ios/Sentry/Sources/Sentry/* example/node_modules/react-native-sentry/ios/Sentry/Sources/Sentry/

test: create-test-bundle install copy-local-files-to-example
	fastlane build_for_device_farm
	fastlane aws_ios_upload_and_run
	ruby check_run_failues.rb

test-android: create-android-test-bundle install copy-local-files-to-example
	fastlane build_android_for_device_farm
	fastlane aws_android_upload_and_run
	ANDROID=1 ruby check_run_failues.rb

local-android-test:
	fastlane build_android_for_device_farm
	ANDROID=1 pytest -vv tests/test_android.py

local-test:
	fastlane build_for_local_appium
	pytest -vv tests/test_ios.py
