import type { Integration } from '@sentry/core';

import { supabaseIntegration as browserSupabaseIntegration } from '@sentry/browser';

type SupabaseReactNativeIntegrationOptions = {
  supabaseClient: unknown;
};

/**
 * Use this integration to instrument your Supabase client.
 *
 * Learn more about Supabase at https://supabase.com
 */
export function supabaseIntegration(options: SupabaseReactNativeIntegrationOptions): Integration {
  return browserSupabaseIntegration({ supabaseClient: options.supabaseClient });
}
