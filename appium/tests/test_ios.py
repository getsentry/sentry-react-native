import os
import json

from time import sleep


def extractText(driver):
    return driver.find_elements_by_xpath('//XCUIElementTypeTextField[@name="status"]')[0].text


def test_send_message(driver):
    driver.find_element_by_accessibility_id('send message').click()
    sleep(3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert event['message'] == 'TEST message'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert event['sdk']['integrations'][0] == 'sentry-cocoa'
    assert event['sdk']['name'] == 'sentry-react-native'
    assert len(event['user']) > 0


def test_version(driver):
    driver.find_element_by_accessibility_id('set version').click()
    driver.find_element_by_accessibility_id('send message').click()
    sleep(3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['release'] == 'org.reactjs.native.example.AwesomeProject-1337'


def test_release(driver):
    driver.find_element_by_accessibility_id('set release').click()
    driver.find_element_by_accessibility_id('send message').click()
    sleep(3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['release'] == 'myversion'


def test_dist(driver):
    driver.find_element_by_accessibility_id('set dist').click()
    driver.find_element_by_accessibility_id('send message').click()
    sleep(3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)
    assert event['dist'] == '500'


def test_throw_error(driver):
    driver.find_element_by_accessibility_id('throw error').click()
    driver.relaunch_app()
    sleep(3)
    value = extractText(driver)
    assert value != None
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    for thread in event['exception']['values']:
        assert len(thread['stacktrace']['frames']) > 0
        cocoa_frames = 0
        js_frames = 0
        for frame in thread['stacktrace']['frames']:
            if frame.get('package', None):
                cocoa_frames += 1
            if frame.get('platform', None) == 'javascript':
                js_frames += 1
        assert js_frames > 0
    assert len(event['exception']['values']) > 0
    assert event['exception']['values'][0]['value'] == "Sentry: Test throw error"
    assert event['exception']['values'][0]['type'] == "Error"
    assert event['platform'] == 'cocoa'
    assert event['level'] == 'fatal'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0

def test_native_crash(driver):
    sleep(2)
    driver.find_element_by_accessibility_id('native crash').click()
    driver.relaunch_app()
    sleep(3)
    value = extractText(driver)
    # the crash should have been already sent
    assert value != None
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert len(event['threads']['values']) > 0
    for thread in event['exception']['values']:
        assert len(thread['stacktrace']['frames']) > 0
        cocoa_frames = 0
        js_frames = 0
        for frame in thread['stacktrace']['frames']:
            if frame.get('package', None):
                cocoa_frames += 1
            if frame.get('platform', None) == 'javascript':
                js_frames += 1
        assert cocoa_frames > 0
        assert js_frames > 0
    assert len(event['exception']['values']) > 0
    assert len(event['debug_meta']['images']) > 0
    assert event['exception']['values'][0]['value'] != None
    assert event['platform'] == 'cocoa'
    assert event['level'] == 'fatal'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0
