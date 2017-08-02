import os
import json

from time import sleep

def test_send_message(driver):
    driver.find_element_by_accessibility_id('send message').click()

    sleep(3)

    value = driver.find_elements_by_xpath('//android.widget.EditText')[0].text

    assert value != None
    event = json.loads(value)

    assert event['event_id'] != None
    assert event['level'] == 'warning'

def test_throw_error(driver):
    driver.find_element_by_accessibility_id('throw error').click()
    driver.relaunch_app()
    value = driver.find_elements_by_xpath('//android.widget.EditText')[0].text
    # the crash should have been already sent
    assert value is None

def test_native_crash(driver):
    sleep(2)
    driver.find_element_by_accessibility_id('native crash').click()
    driver.relaunch_app()
    sleep(3)
    value = driver.find_elements_by_xpath('//android.widget.EditText')[0].text

    assert value != None
    event = json.loads(value)

    assert event['event_id'] != None
    assert event['level'] == 'fatal'
