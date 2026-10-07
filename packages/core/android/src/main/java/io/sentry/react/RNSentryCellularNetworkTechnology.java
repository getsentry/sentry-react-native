package io.sentry.react;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Process;
import android.telephony.TelephonyCallback;
import android.telephony.TelephonyDisplayInfo;
import android.telephony.TelephonyManager;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import io.sentry.ILogger;
import io.sentry.SentryLevel;
import io.sentry.android.core.BuildInfoProvider;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * Adds the generation of the cellular network technology to the device context, for example {@code
 * 4g} or {@code 5g}. It only fills {@code connection_effective_type} when sentry-android did not
 * set it, so it has no effect with sentry-android 8.60.0 and later.
 */
final class RNSentryCellularNetworkTechnology {

  static final @NotNull String GENERATION_2G = "2g";
  static final @NotNull String GENERATION_3G = "3g";
  static final @NotNull String GENERATION_4G = "4g";
  static final @NotNull String GENERATION_5G = "5g";

  // Not in android.Manifest.permission before API 33, and the module compiles against API 31.
  private static final @NotNull String READ_BASIC_PHONE_STATE =
      "android.permission.READ_BASIC_PHONE_STATE";

  private final @NotNull Context context;
  private final @NotNull ILogger logger;
  private final @NotNull BuildInfoProvider buildInfoProvider;

  private final @NotNull Object registrationLock = new Object();

  // Object, so that the class loads on devices that do not have TelephonyCallback.
  private @Nullable Object displayInfoCallback;

  private final @NotNull AtomicReference<String> displayInfoTechnology = new AtomicReference<>();

  RNSentryCellularNetworkTechnology(
      final @NotNull Context context,
      final @NotNull ILogger logger,
      final @NotNull BuildInfoProvider buildInfoProvider) {
    this.context =
        context.getApplicationContext() != null ? context.getApplicationContext() : context;
    this.logger = logger;
    this.buildInfoProvider = buildInfoProvider;
  }

  @SuppressWarnings("unchecked")
  void addToDeviceContext(final @NotNull Map<String, Object> serializedScope) {
    final @Nullable Object contexts = serializedScope.get("contexts");
    if (!(contexts instanceof Map)) {
      return;
    }
    final @Nullable Object device = ((Map<String, Object>) contexts).get("device");
    if (!(device instanceof Map)) {
      return;
    }
    final Map<String, Object> deviceContext = (Map<String, Object>) device;
    if (!"cellular".equals(deviceContext.get("connection_type"))
        || deviceContext.get("connection_effective_type") != null) {
      return;
    }
    final @Nullable String technology = getCellularNetworkTechnology();
    if (technology != null) {
      deviceContext.put("connection_effective_type", technology);
    }
  }

  @Nullable
  String getCellularNetworkTechnology() {
    if (buildInfoProvider.getSdkInfoVersion() >= Build.VERSION_CODES.S) {
      return displayInfoTechnology.get();
    }
    return getDataNetworkTechnology();
  }

  @SuppressLint("NewApi")
  void register() {
    if (buildInfoProvider.getSdkInfoVersion() < Build.VERSION_CODES.S) {
      return;
    }
    synchronized (registrationLock) {
      if (displayInfoCallback != null) {
        return;
      }
      final @Nullable TelephonyManager telephonyManager = getTelephonyManager();
      if (telephonyManager == null) {
        return;
      }
      try {
        final DisplayInfoCallback callback = new DisplayInfoCallback(this);
        telephonyManager.registerTelephonyCallback(Runnable::run, callback);
        displayInfoCallback = callback;
      } catch (Throwable e) { // NOPMD - Devices without telephony support throw here.
        logger.log(
            SentryLevel.INFO, "Could not listen for cellular network technology changes.", e);
      }
    }
  }

  @SuppressLint("NewApi")
  void unregister() {
    synchronized (registrationLock) {
      final @Nullable Object callback = displayInfoCallback;
      if (callback == null) {
        return;
      }
      final @Nullable TelephonyManager telephonyManager = getTelephonyManager();
      if (telephonyManager == null) {
        return;
      }
      try {
        telephonyManager.unregisterTelephonyCallback((TelephonyCallback) callback);
        displayInfoCallback = null;
      } catch (Throwable e) { // NOPMD - Unregistering is best-effort.
        logger.log(
            SentryLevel.INFO,
            "Could not stop listening for cellular network technology changes.",
            e);
      }
    }
  }

  @SuppressLint({"MissingPermission", "NewApi"})
  private @Nullable String getDataNetworkTechnology() {
    if (buildInfoProvider.getSdkInfoVersion() < Build.VERSION_CODES.N) {
      return null;
    }
    // The SDK does not declare these permissions. Only apps that request one of them get a value.
    if (!hasPermission(Manifest.permission.READ_PHONE_STATE)
        && !hasPermission(READ_BASIC_PHONE_STATE)) {
      return null;
    }
    final @Nullable TelephonyManager telephonyManager = getTelephonyManager();
    if (telephonyManager == null) {
      return null;
    }
    try {
      return networkTypeToGeneration(telephonyManager.getDataNetworkType());
    } catch (Throwable e) { // NOPMD - The permission can be revoked after the check.
      logger.log(SentryLevel.INFO, "Could not retrieve the cellular network technology.", e);
      return null;
    }
  }

  private boolean hasPermission(final @NotNull String permission) {
    return context.checkPermission(permission, Process.myPid(), Process.myUid())
        == PackageManager.PERMISSION_GRANTED;
  }

  private @Nullable TelephonyManager getTelephonyManager() {
    final @Nullable Object service = context.getSystemService(Context.TELEPHONY_SERVICE);
    return service instanceof TelephonyManager ? (TelephonyManager) service : null;
  }

  @RequiresApi(api = Build.VERSION_CODES.S)
  @SuppressWarnings("deprecation")
  static @Nullable String toGeneration(final @NotNull TelephonyDisplayInfo displayInfo) {
    switch (displayInfo.getOverrideNetworkType()) {
      case TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA:
      case TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_ADVANCED:
      case TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA_MMWAVE:
        return GENERATION_5G;
      case TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_LTE_CA:
      case TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_LTE_ADVANCED_PRO:
        return GENERATION_4G;
      default:
        return networkTypeToGeneration(displayInfo.getNetworkType());
    }
  }

  @SuppressWarnings("deprecation")
  static @Nullable String networkTypeToGeneration(final int networkType) {
    switch (networkType) {
      case TelephonyManager.NETWORK_TYPE_GPRS:
      case TelephonyManager.NETWORK_TYPE_EDGE:
      case TelephonyManager.NETWORK_TYPE_CDMA:
      case TelephonyManager.NETWORK_TYPE_1xRTT:
      case TelephonyManager.NETWORK_TYPE_IDEN:
      case TelephonyManager.NETWORK_TYPE_GSM:
        return GENERATION_2G;
      case TelephonyManager.NETWORK_TYPE_UMTS:
      case TelephonyManager.NETWORK_TYPE_EVDO_0:
      case TelephonyManager.NETWORK_TYPE_EVDO_A:
      case TelephonyManager.NETWORK_TYPE_EVDO_B:
      case TelephonyManager.NETWORK_TYPE_EHRPD:
      case TelephonyManager.NETWORK_TYPE_HSDPA:
      case TelephonyManager.NETWORK_TYPE_HSUPA:
      case TelephonyManager.NETWORK_TYPE_HSPA:
      case TelephonyManager.NETWORK_TYPE_HSPAP:
      case TelephonyManager.NETWORK_TYPE_TD_SCDMA:
        return GENERATION_3G;
      case TelephonyManager.NETWORK_TYPE_LTE:
      case TelephonyManager.NETWORK_TYPE_IWLAN:
        return GENERATION_4G;
      case TelephonyManager.NETWORK_TYPE_NR:
        return GENERATION_5G;
      default:
        return null;
    }
  }

  @RequiresApi(api = Build.VERSION_CODES.S)
  private static final class DisplayInfoCallback extends TelephonyCallback
      implements TelephonyCallback.DisplayInfoListener {

    private final @NotNull RNSentryCellularNetworkTechnology provider;

    DisplayInfoCallback(final @NotNull RNSentryCellularNetworkTechnology provider) {
      this.provider = provider;
    }

    @Override
    public void onDisplayInfoChanged(final @NonNull TelephonyDisplayInfo telephonyDisplayInfo) {
      provider.displayInfoTechnology.set(toGeneration(telephonyDisplayInfo));
    }
  }
}
