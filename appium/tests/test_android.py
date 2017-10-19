import os
import json

from time import sleep


def extractText(driver):
    return driver.find_elements_by_xpath('//android.widget.EditText')[0].text

def wait(driver, duration):
    sleep(duration)
    driver.implicitly_wait(duration * 1000)

def test_send_message(driver):
    wait(driver, 3)
    driver.find_element_by_accessibility_id('send message').click()
    wait(driver, 3)
    value = extractText(driver)

    assert value != None
    event = json.loads(value)

    assert event['event_id'] != None
    assert event['level'] == 'warning'
    assert event['message'] == 'TEST message'
    assert event['extra']['react']
    assert event['tags']['react']

# def test_throw_error(driver):
#     driver.implicitly_wait(5000)
#     driver.find_element_by_accessibility_id('throw error').click()
#     driver.relaunch_app()
#     value = extractText(driver)
#     driver.implicitly_wait(5000)
#     # the crash should have been already sent
#     assert value is None

# def test_native_crash(driver):
#     driver.implicitly_wait(5000)
#     driver.find_element_by_accessibility_id('native crash').click()
#     driver.relaunch_app()
#     wait(5)
#     driver.implicitly_wait(5000)
#     value = extractText(driver)

#     assert value != None
#     event = json.loads(value)

#     assert event['event_id'] != None
#     assert event['level'] == 'fatal'

def test_version(driver):
    wait(driver, 3)
    driver.find_element_by_accessibility_id('set version').click()
    driver.find_element_by_accessibility_id('send message').click()
    wait(driver, 3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['release'] == 'com.awesomeproject.full-1337'


def test_release(driver):
    wait(driver, 3)
    driver.find_element_by_accessibility_id('set release').click()
    driver.find_element_by_accessibility_id('send message').click()
    wait(driver, 3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['release'] == 'myversion'


def test_dist(driver):
    wait(driver, 3)
    driver.find_element_by_accessibility_id('set dist').click()
    driver.find_element_by_accessibility_id('send message').click()
    wait(driver, 3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['dist'] == '500'
