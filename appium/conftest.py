import os
import pytest

from appium import webdriver


@pytest.fixture(scope='function')
def driver(request):
    app = os.path.abspath('/Users/haza/Library/Developer/Xcode/DerivedData/AwesomeProject-gviruxuketsiseechzzeiucbzkzk/Build/Products/Debug-iphonesimulator/AwesomeProject.app')

    screenshot_folder = os.getenv('SCREENSHOT_PATH', '')

    desired_caps = {}
    if screenshot_folder == '':
        desired_caps['platformName'] = 'iOS'
        desired_caps['platformVersion'] = '10.3'
        desired_caps['deviceName'] = 'iPhone Simulator'
        desired_caps['app'] = app

    _driver = webdriver.Remote(
        command_executor='http://127.0.0.1:4723/wd/hub',
        desired_capabilities=desired_caps)

    request.addfinalizer(_driver.quit)

    return _driver
