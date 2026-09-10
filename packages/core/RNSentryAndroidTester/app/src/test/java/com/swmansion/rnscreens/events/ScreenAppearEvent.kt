package com.swmansion.rnscreens.events

import com.facebook.react.uimanager.events.Event

/**
 * Stands in for the react-native-screens event, so a test can dispatch an event that carries this
 * class name while reporting a different event name. That is what R8 produces when it merges the
 * event classes of a release build into one.
 */
class ScreenAppearEvent(
    private val name: String,
) : Event<ScreenAppearEvent>() {
    override fun getEventName(): String = name
}
