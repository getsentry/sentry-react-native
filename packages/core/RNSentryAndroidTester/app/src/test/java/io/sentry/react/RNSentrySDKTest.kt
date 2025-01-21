package io.sentry.react

import android.content.Context
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.ReadableMap
import io.sentry.ILogger
import io.sentry.Sentry.OptionsConfiguration
import io.sentry.SentryLevel
import io.sentry.android.core.SentryAndroidOptions
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4
import org.mockito.ArgumentMatchers.contains
import org.mockito.ArgumentMatchers.eq
import org.mockito.MockedStatic
import org.mockito.Mockito.mock
import org.mockito.Mockito.mockStatic
import org.mockito.Mockito.verify
import org.mockito.MockitoAnnotations

@RunWith(JUnit4::class)
class RNSentrySDKTest {
    private val configurationFile = "sentry.options.json"

    private lateinit var mockLogger: ILogger
    private lateinit var mockContext: Context
    private lateinit var mockConfiguration: OptionsConfiguration<SentryAndroidOptions>
    private lateinit var mockedRNSentryStart: MockedStatic<RNSentryStart>
    private lateinit var mockedRNSentryJsonUtils: MockedStatic<RNSentryJsonUtils>

    @Before
    fun setUp() {
        MockitoAnnotations.openMocks(this)
        mockLogger = mock(ILogger::class.java)
        mockContext = mock(Context::class.java)
        mockConfiguration = mock(OptionsConfiguration::class.java) as OptionsConfiguration<SentryAndroidOptions>
        mockedRNSentryStart = mockStatic(RNSentryStart::class.java)
        mockedRNSentryJsonUtils = mockStatic(RNSentryJsonUtils::class.java)
    }

    @After
    fun tearDown() {
        mockedRNSentryStart.close()
        mockedRNSentryJsonUtils.close()
    }

    @Test
    fun `init with passed configuration callback when no valid json file is provided`() {
        val mockJsonObject = null
        mockedRNSentryJsonUtils
            .`when`<JSONObject> {
                RNSentryJsonUtils.getOptionsFromConfigurationFile(mockContext, configurationFile, mockLogger)
            }.thenReturn(mockJsonObject)
        RNSentrySDK.init(mockContext, mockConfiguration, mockLogger)

        verify(mockLogger).log(
            eq(SentryLevel.WARNING),
            contains("Failed to load configuration file(sentry.options.json), starting with configuration callback."),
        )

        mockedRNSentryStart.verify {
            RNSentryStart.startWithConfiguration(mockContext, mockConfiguration)
        }
    }

    @Test
    fun `init with passed configuration callback when no valid readable map is created`() {
        val mockJsonObject = JSONObject()
        mockedRNSentryJsonUtils
            .`when`<JSONObject> {
                RNSentryJsonUtils.getOptionsFromConfigurationFile(mockContext, configurationFile, mockLogger)
            }.thenReturn(mockJsonObject)
        val mockReadableMap = null
        mockedRNSentryJsonUtils
            .`when`<ReadableMap> {
                RNSentryJsonUtils.jsonObjectToReadableMap(
                    mockJsonObject,
                )
            }.thenReturn(mockReadableMap)

        RNSentrySDK.init(mockContext, mockConfiguration, mockLogger)

        verify(mockLogger).log(
            eq(SentryLevel.WARNING),
            contains("Failed to load configuration file(sentry.options.json), starting with configuration callback."),
        )
        mockedRNSentryStart.verify {
            RNSentryStart.startWithConfiguration(mockContext, mockConfiguration)
        }
    }

    @Test
    fun `init with the json file and the passed configuration when a valid json is provided`() {
        val mockJsonObject = JSONObject()
        mockedRNSentryJsonUtils
            .`when`<JSONObject> {
                RNSentryJsonUtils.getOptionsFromConfigurationFile(mockContext, configurationFile, mockLogger)
            }.thenReturn(mockJsonObject)
        val mockReadableMap =
            JavaOnlyMap.of(
                "dsn",
                "https://abc@def.ingest.sentry.io/1234567",
            )

        mockedRNSentryJsonUtils
            .`when`<ReadableMap> {
                RNSentryJsonUtils.jsonObjectToReadableMap(
                    mockJsonObject,
                )
            }.thenReturn(mockReadableMap)

        RNSentrySDK.init(mockContext, mockConfiguration, mockLogger)

        mockedRNSentryStart.verify {
            RNSentryStart.startWithOptions(mockContext, mockReadableMap, mockConfiguration, null, mockLogger)
        }
    }

    @Test
    fun `fails with an error when there is an unhandled exception in initialisation`() {
        mockedRNSentryJsonUtils
            .`when`<JSONObject> {
                RNSentryJsonUtils.getOptionsFromConfigurationFile(mockContext, configurationFile, mockLogger)
            }.thenThrow(RuntimeException("Test exception"))

        val exception =
            assertThrows(RuntimeException::class.java) {
                RNSentrySDK.init(mockContext, mockConfiguration, mockLogger)
            }

        assertEquals("Failed to initialize Sentry's React Native SDK", exception.message)
    }
}
