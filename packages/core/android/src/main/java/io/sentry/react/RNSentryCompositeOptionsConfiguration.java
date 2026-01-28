package io.sentry.react;

import io.sentry.Sentry.OptionsConfiguration;
import io.sentry.android.core.SentryAndroidOptions;
import java.util.List;
import org.jetbrains.annotations.NotNull;

class RNSentryCompositeOptionsConfiguration implements OptionsConfiguration<SentryAndroidOptions> {
  private final @NotNull List<OptionsConfiguration<SentryAndroidOptions>> configurations;

  @SafeVarargs
  protected RNSentryCompositeOptionsConfiguration(
      @NotNull OptionsConfiguration<SentryAndroidOptions>... configurations) {
    this.configurations = List.of(configurations);
  }

  @Override
  public void configure(@NotNull SentryAndroidOptions options) {
    for (OptionsConfiguration<SentryAndroidOptions> configuration : configurations) {
      if (configuration != null) {
        configuration.configure(options);
      }
    }
  }
}
