create-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/ wheelhouse/ requirements.txt conftest.py

install:
	cd example; yarn install

test: create-test-bundle install
	fastlane aws_device_run_ios
	fastlane aws_ios_upload_and_run
