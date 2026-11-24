package io.sentry.react

import io.sentry.IScope
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify

@RunWith(JUnit4::class)
class RNSentryModuleImplSetTagTest {
    @Test
    fun `sets non-empty tag value`() {
        val scope = mock<IScope>()

        RNSentryModuleImpl.setTagOnScope(scope, "turbo_module.name", "RNSentry")

        verify(scope).setTag("turbo_module.name", "RNSentry")
        verify(scope, never()).removeTag("turbo_module.name")
    }

    @Test
    fun `removes tag when value is empty`() {
        val scope = mock<IScope>()

        RNSentryModuleImpl.setTagOnScope(scope, "turbo_module.name", "")

        verify(scope).removeTag("turbo_module.name")
        verify(scope, never()).setTag("turbo_module.name", "")
    }

    @Test
    fun `removes tag when value is null`() {
        val scope = mock<IScope>()

        RNSentryModuleImpl.setTagOnScope(scope, "turbo_module.method", null)

        verify(scope).removeTag("turbo_module.method")
    }
}
