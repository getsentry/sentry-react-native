package io.sentry.react

import io.sentry.ILogger
import org.junit.Before
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.Mockito.mock

@RunWith(JUnit4::class)
class RNSentryModuleImplTest {
    private lateinit var module: RNSentryModuleImpl
    private lateinit var logger: ILogger

    @Before
    fun setUp() {
        logger = mock(ILogger::class.java)

        module = Utils.createRNSentryModuleWithMockedContext()
    }
}
