npm-publish:
	@echo "--> npm publish"
	rm -rf ~/tmp/ | true
	cd ~/; mkdir tmp; cd tmp; git clone --recursive https://github.com/getsentry/react-native-sentry.git; cd react-native-sentry; npm publish
	rm -rf ~/tmp/
