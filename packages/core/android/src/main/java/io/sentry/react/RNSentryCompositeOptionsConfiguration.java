package io.sentry.react;

import io.sentry.Sentry.OptionsConfiguration;
import io.sentry.android.core.SentryAndroidOptions;
import org.jetbrains.annotations.NotNull;

public class RNSentryCompositeOptionsConfiguration
    implements OptionsConfiguration<SentryAndroidOptions> {
  private final OptionsConfiguration<SentryAndroidOptions> baseConfiguration;
  private final OptionsConfiguration<SentryAndroidOptions> overridingConfiguration;

  public RNSentryCompositeOptionsConfiguration(
      OptionsConfiguration<SentryAndroidOptions> baseConfiguration,
      OptionsConfiguration<SentryAndroidOptions> overridingConfiguration) {
    this.baseConfiguration = baseConfiguration;
    this.overridingConfiguration = overridingConfiguration;
  }

  @Override
  public void configure(@NotNull SentryAndroidOptions options) {
    baseConfiguration.configure(options);
    overridingConfiguration.configure(options);
  }
}
