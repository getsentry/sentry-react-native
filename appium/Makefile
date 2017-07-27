create-test-bundle:
	rm test_bundle.zip | true
	zip -r test_bundle.zip tests/ wheelhouse/ requirements.txt conftest.py

install:
	cd example; yarn install

test: create-test-bundle install
	fastlane build_for_device_farm
	fastlane aws_ios_upload_and_run

local-test:
	fastlane build_for_local_appium
	pytest -vv tests/
