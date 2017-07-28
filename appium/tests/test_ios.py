import os
import json

from time import sleep

def test_send_message(driver):
    driver.find_element_by_accessibility_id('send message').click()

    sleep(3)

    value = driver.find_element_by_accessibility_id('textarea').get_attribute("value")

    assert value != None
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert event['message'] == 'TEST message'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0

def test_throw_error(no_reset_driver):
    no_reset_driver.reset()

    no_reset_driver.find_element_by_accessibility_id('throw error').click()
    sleep(1)
    no_reset_driver.close_app()
    no_reset_driver.launch_app()
    sleep(3)
    value = no_reset_driver.find_element_by_accessibility_id('textarea').get_attribute("value")

    assert value != None
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert event['exception']['values'][0]['value'] == 'Sentry: Test throw error'
    assert event['platform'] == 'cocoa'
    assert event['level'] == 'fatal'
    assert event['dist'] == '1'
    assert event['logger'] == 'javascript'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0

def test_native_crash(no_reset_driver):
    no_reset_driver.reset()

    no_reset_driver.find_element_by_accessibility_id('native crash').click()
    sleep(1)
    no_reset_driver.close_app()
    no_reset_driver.launch_app()
    sleep(3)
    value = no_reset_driver.find_element_by_accessibility_id('textarea').get_attribute("value")

    assert value != None
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert len(event['threads']['values']) > 0
    assert len(event['exception']['values']) > 0
    assert len(event['debug_meta']['images']) > 0
    assert event['platform'] == 'cocoa'
    assert event['level'] == 'fatal'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0
