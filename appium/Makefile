create-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/test_ios.py wheelhouse/ requirements.txt conftest.py

create-android-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/test_android.py wheelhouse/ requirements.txt conftest.py

new-demo-project:
	cd ../examples/react-native; make clean-project

copy-local-files-to-example:
	rm -rf example/node_modules/react-native-sentry/lib/*
	find example/node_modules/react-native-sentry/ios -name 'RN*.[h|m]' -exec rm {} \;
	rm -rf example/node_modules/react-native-sentry/ios/Sentry/Sources/Sentry/*
	rm -rf example/node_modules/react-native-sentry/android/*
	rm -rf example/node_modules/react-native-sentry/scripts/*
	rm -rf example/node_modules/react-native-sentry/sentry.gradle
	cp -r ../lib/* example/node_modules/react-native-sentry/lib/
	cp ../sentry.gradle example/node_modules/react-native-sentry/sentry.gradle
	cp -r ../scripts/* example/node_modules/react-native-sentry/scripts/
	find ../ios -name 'RN*.[h|m]' -exec cp {} example/node_modules/react-native-sentry/ios/ \;
	cp -r ../android/* example/node_modules/react-native-sentry/android/
	cp -r ../ios/Sentry/Sources/Sentry/* example/node_modules/react-native-sentry/ios/Sentry/Sources/Sentry/
	rm -rf example/node_modules/react-native-sentry/ios/Sentry/Sentry.xcodeproj
	cp -r ../ios/Sentry/Sentry.xcodeproj example/node_modules/react-native-sentry/ios/Sentry/Sentry.xcodeproj

install: new-demo-project copy-local-files-to-example

test: create-test-bundle install
	fastlane build_for_device_farm
	fastlane aws_ios_upload_and_run
	ruby check_run_failues.rb

test-android: create-android-test-bundle install
	fastlane build_android_for_device_farm
	fastlane aws_android_upload_and_run
	ANDROID=1 ruby check_run_failues.rb

local-android-test: create-android-test-bundle install
	fastlane build_android_for_device_farm
	ANDROID=1 pytest -vv tests/test_android.py

local-test: create-test-bundle install
	fastlane build_for_local_appium
	pytest -vv tests/test_ios.py
