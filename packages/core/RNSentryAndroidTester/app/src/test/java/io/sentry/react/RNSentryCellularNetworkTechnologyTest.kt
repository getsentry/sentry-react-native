package io.sentry.react

import android.content.Context
import android.content.pm.PackageManager
import android.telephony.TelephonyDisplayInfo
import android.telephony.TelephonyManager
import io.sentry.ILogger
import io.sentry.android.core.BuildInfoProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.mock
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class RNSentryCellularNetworkTechnologyTest {
    private lateinit var context: Context
    private lateinit var telephonyManager: TelephonyManager
    private lateinit var buildInfo: BuildInfoProvider
    private lateinit var sut: RNSentryCellularNetworkTechnology

    @Before
    fun setUp() {
        context = mock(Context::class.java)
        telephonyManager = mock(TelephonyManager::class.java)
        buildInfo = mock(BuildInfoProvider::class.java)
        whenever(context.getSystemService(Context.TELEPHONY_SERVICE)).thenReturn(telephonyManager)
        whenever(context.checkPermission(any(), anyInt(), anyInt())).thenReturn(PackageManager.PERMISSION_GRANTED)
        whenever(buildInfo.sdkInfoVersion).thenReturn(30)
        whenever(telephonyManager.dataNetworkType).thenReturn(TelephonyManager.NETWORK_TYPE_LTE)
        sut = RNSentryCellularNetworkTechnology(context, mock(ILogger::class.java), buildInfo)
    }

    private fun scopeWithDevice(device: Map<String, Any?>): MutableMap<String, Any> =
        mutableMapOf("contexts" to mutableMapOf<String, Any>("device" to device.toMutableMap()))

    @Suppress("UNCHECKED_CAST")
    private fun deviceOf(scope: Map<String, Any>): Map<String, Any?> =
        (scope["contexts"] as Map<String, Any>)["device"] as Map<String, Any?>

    @Test
    fun addsTechnologyToCellularDeviceContext() {
        val scope = scopeWithDevice(mapOf("connection_type" to "cellular"))

        sut.addToDeviceContext(scope)

        assertEquals("4g", deviceOf(scope)["connection_effective_type"])
    }

    @Test
    fun keepsTechnologyFromNativeSdk() {
        val scope =
            scopeWithDevice(mapOf("connection_type" to "cellular", "connection_effective_type" to "5g"))

        sut.addToDeviceContext(scope)

        assertEquals("5g", deviceOf(scope)["connection_effective_type"])
    }

    @Test
    fun skipsNonCellularConnection() {
        val scope = scopeWithDevice(mapOf("connection_type" to "wifi"))

        sut.addToDeviceContext(scope)

        assertNull(deviceOf(scope)["connection_effective_type"])
    }

    @Test
    fun skipsWithoutPhoneStatePermission() {
        whenever(context.checkPermission(any(), anyInt(), anyInt())).thenReturn(PackageManager.PERMISSION_DENIED)
        val scope = scopeWithDevice(mapOf("connection_type" to "cellular"))

        sut.addToDeviceContext(scope)

        assertNull(deviceOf(scope)["connection_effective_type"])
    }

    @Test
    fun skipsWhenTelephonyThrows() {
        whenever(telephonyManager.dataNetworkType).thenThrow(SecurityException("revoked"))
        val scope = scopeWithDevice(mapOf("connection_type" to "cellular"))

        sut.addToDeviceContext(scope)

        assertNull(deviceOf(scope)["connection_effective_type"])
    }

    @Test
    fun ignoresScopeWithoutDeviceContext() {
        val scope = mutableMapOf<String, Any>("contexts" to mutableMapOf<String, Any>())

        sut.addToDeviceContext(scope)

        assertEquals(mutableMapOf<String, Any>(), scope["contexts"])
    }

    @Test
    fun returnsNullBeforeFirstDisplayInfoOnApi31() {
        whenever(buildInfo.sdkInfoVersion).thenReturn(31)

        assertNull(sut.cellularNetworkTechnology)
    }

    @Test
    fun mapsNetworkTypesToGenerations() {
        assertEquals("2g", RNSentryCellularNetworkTechnology.networkTypeToGeneration(TelephonyManager.NETWORK_TYPE_EDGE))
        assertEquals("3g", RNSentryCellularNetworkTechnology.networkTypeToGeneration(TelephonyManager.NETWORK_TYPE_HSPAP))
        assertEquals("4g", RNSentryCellularNetworkTechnology.networkTypeToGeneration(TelephonyManager.NETWORK_TYPE_LTE))
        assertEquals("5g", RNSentryCellularNetworkTechnology.networkTypeToGeneration(TelephonyManager.NETWORK_TYPE_NR))
        assertNull(RNSentryCellularNetworkTechnology.networkTypeToGeneration(TelephonyManager.NETWORK_TYPE_UNKNOWN))
    }

    @Test
    fun prefersDisplayInfoOverrideType() {
        val displayInfo = mock(TelephonyDisplayInfo::class.java)
        whenever(displayInfo.networkType).thenReturn(TelephonyManager.NETWORK_TYPE_LTE)
        whenever(displayInfo.overrideNetworkType).thenReturn(TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA)

        assertEquals("5g", RNSentryCellularNetworkTechnology.toGeneration(displayInfo))
    }

    @Test
    fun fallsBackToDisplayInfoNetworkType() {
        val displayInfo = mock(TelephonyDisplayInfo::class.java)
        whenever(displayInfo.networkType).thenReturn(TelephonyManager.NETWORK_TYPE_UMTS)
        whenever(displayInfo.overrideNetworkType).thenReturn(TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE)

        assertEquals("3g", RNSentryCellularNetworkTechnology.toGeneration(displayInfo))
    }
}
