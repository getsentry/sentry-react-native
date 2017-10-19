import os
import sys
import pytest
import traceback

from appium import webdriver

DEBUG_DRIVER = os.environ.get('DEBUG_DRIVER') == '1'


def hook_driver(driver):
    real_execute = driver.command_executor.execute
    def execute_proxy(*args, **kwargs):
        print 'calling remote', args, kwargs
        traceback.print_stack(file=sys.stdout, limit=4)
        return real_execute(*args, **kwargs)
    driver.command_executor.execute = execute_proxy


class DriverProxy(object):

    def __init__(self, make_driver):
        self._make_driver = make_driver
        self._driver = None

    def quit(self):
        if self._driver is None:
            return

        # this fails but actually succeeds
        try:
            self._driver.quit()
        except Exception:
            pass
        self._driver = None

    def relaunch_app(self):
        #self.quit() if we quit here, we loose connection to the app

        # this fails but actually succeeds
        try:
            self.launch_app()
        except Exception:
            pass

    def _get_driver(self):
        if self._driver is None:
            self._driver = self._make_driver()
            if DEBUG_DRIVER:
                hook_driver(self._driver)
        return self._driver

    def __getattr__(self, name):
        return getattr(self._get_driver(), name)


@pytest.fixture(scope='function')
def driver(request):
    def make_driver():
        return webdriver.Remote(
            command_executor='http://127.0.0.1:4723/wd/hub',
            desired_capabilities=default_capabilities())

    driver = DriverProxy(make_driver)
    request.addfinalizer(driver.quit)

    return driver


@pytest.fixture(scope='function')
def on_aws():
    return runs_on_aws()


def runs_on_aws():
    return os.getenv('SCREENSHOT_PATH', False)


def default_capabilities():
    desired_caps = {}

    desired_caps['noReset'] = True
    desired_caps['showIOSLog'] = True
    if not runs_on_aws():
        if os.environ.get('ANDROID') == '1':
            desired_caps['app'] = os.path.abspath('example/android/app/build/outputs/apk/app-full-release-unsigned.apk')
            desired_caps['platformName'] = 'Android'
            desired_caps['deviceName'] = 'Android'
        else:
            desired_caps['app'] = os.path.abspath('aws/Build/Products/Release-iphonesimulator/AwesomeProject.app')
            desired_caps['platformName'] = 'iOS'
            desired_caps['platformVersion'] = '11.0'
            desired_caps['deviceName'] = 'iPhone Simulator'


    return desired_caps
