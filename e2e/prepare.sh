cp App.js app/App.js
cp jest.config.js app/jest.config.js
mkdir app/test
cp e2e.test.js app/test/e2e.test.js


cd app && yarn add jest wd appium dotenv
cd app && yalc add @sentry/react-native
