import os
import pytest

from appium import webdriver


@pytest.fixture(scope='function')
def driver(request):
    return get_driver(request, default_capabilities())

@pytest.fixture(scope='function')
def no_reset_driver(request):
    desired_caps = default_capabilities()
    desired_caps['noReset'] = True
    return get_driver(request, desired_caps)

def get_driver(request, desired_caps):
    _driver = webdriver.Remote(
        command_executor='http://127.0.0.1:4723/wd/hub',
        desired_capabilities=desired_caps)

    request.addfinalizer(_driver.quit)

    return _driver

def default_capabilities():
    app = os.path.abspath('aws/Build/Products/Release-iphonesimulator/AwesomeProject.app')

    screenshot_folder = os.getenv('SCREENSHOT_PATH', '')

    desired_caps = {}

    if screenshot_folder == '':
        desired_caps['platformName'] = 'iOS'
        desired_caps['platformVersion'] = '10.3'
        desired_caps['deviceName'] = 'iPhone Simulator'
        desired_caps['app'] = app

    return desired_caps
