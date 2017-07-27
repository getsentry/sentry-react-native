import os
import json

from time import sleep

def test_send_message(driver):
    driver.find_element_by_accessibility_id('send message').click()

    sleep(1)

    value = driver.find_element_by_accessibility_id('textarea').get_attribute("value")
    event = json.loads(value)

    assert len(event['breadcrumbs']) > 0
    assert len(event['contexts']) > 0
    assert event['message'] == 'TEST message'
    assert event['extra']['react']
    assert event['tags']['react'] == '1'
    assert len(event['user']) > 0
    #assert value == 'button3'

    # def test_scroll(self):
    #     els = self.driver.find_elements_by_class_name('XCUIElementTypeButton')
    #     els[5].click()

    #     sleep(1)
    #     try:
    #         el = self.driver.find_element_by_accessibility_id('Allow')
    #         el.click()
    #         sleep(1)
    #     except:
    #         pass

    #     el = self.driver.find_element_by_xpath('//XCUIElementTypeMap[1]')

    #     location = el.location
    #     self.driver.swipe(start_x=location['x'], start_y=location['y'], end_x=0.5, end_y=location['y'], duration=800)
