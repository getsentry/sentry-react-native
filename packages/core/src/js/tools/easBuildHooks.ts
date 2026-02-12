/**
 * EAS Build Hooks for Sentry
 *
 * This module provides utilities for capturing EAS build lifecycle events
 * and sending them to Sentry. It supports the following EAS npm hooks:
 * - eas-build-on-error: Captures build failures
 * - eas-build-on-success: Captures successful builds (optional)
 * - eas-build-on-complete: Captures build completion with metrics
 *
 * @see https://docs.expo.dev/build-reference/npm-hooks/
 */

/* eslint-disable no-console */
/* eslint-disable no-bitwise */

const SENTRY_DSN_ENV = 'SENTRY_DSN';
const EAS_BUILD_ENV = 'EAS_BUILD';

/**
 * Environment variables provided by EAS Build.
 * @see https://docs.expo.dev/build-reference/variables/
 */
export interface EASBuildEnv {
  EAS_BUILD?: string;
  EAS_BUILD_ID?: string;
  EAS_BUILD_PLATFORM?: string;
  EAS_BUILD_PROFILE?: string;
  EAS_BUILD_PROJECT_ID?: string;
  EAS_BUILD_GIT_COMMIT_HASH?: string;
  EAS_BUILD_RUN_FROM_CI?: string;
  EAS_BUILD_STATUS?: string;
  EAS_BUILD_APP_VERSION?: string;
  EAS_BUILD_APP_BUILD_VERSION?: string;
  EAS_BUILD_USERNAME?: string;
  EAS_BUILD_WORKINGDIR?: string;
}

/** Options for configuring EAS build hook behavior. */
export interface EASBuildHookOptions {
  dsn?: string;
  tags?: Record<string, string>;
  captureSuccessfulBuilds?: boolean;
  errorMessage?: string;
  successMessage?: string;
}

interface ParsedDsn {
  protocol: string;
  host: string;
  projectId: string;
  publicKey: string;
}

interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: string;
  level: 'error' | 'info' | 'warning';
  logger: string;
  environment: string;
  release?: string;
  tags: Record<string, string>;
  contexts: Record<string, Record<string, unknown>>;
  message?: { formatted: string };
  exception?: {
    values: Array<{ type: string; value: string; mechanism: { type: string; handled: boolean } }>;
  };
  fingerprint?: string[];
  sdk: { name: string; version: string };
}

/** Checks if the current environment is an EAS Build. */
export function isEASBuild(): boolean {
  return process.env[EAS_BUILD_ENV] === 'true';
}

/** Gets the EAS build environment variables. */
export function getEASBuildEnv(): EASBuildEnv {
  return {
    EAS_BUILD: process.env.EAS_BUILD,
    EAS_BUILD_ID: process.env.EAS_BUILD_ID,
    EAS_BUILD_PLATFORM: process.env.EAS_BUILD_PLATFORM,
    EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
    EAS_BUILD_PROJECT_ID: process.env.EAS_BUILD_PROJECT_ID,
    EAS_BUILD_GIT_COMMIT_HASH: process.env.EAS_BUILD_GIT_COMMIT_HASH,
    EAS_BUILD_RUN_FROM_CI: process.env.EAS_BUILD_RUN_FROM_CI,
    EAS_BUILD_STATUS: process.env.EAS_BUILD_STATUS,
    EAS_BUILD_APP_VERSION: process.env.EAS_BUILD_APP_VERSION,
    EAS_BUILD_APP_BUILD_VERSION: process.env.EAS_BUILD_APP_BUILD_VERSION,
    EAS_BUILD_USERNAME: process.env.EAS_BUILD_USERNAME,
    EAS_BUILD_WORKINGDIR: process.env.EAS_BUILD_WORKINGDIR,
  };
}

function parseDsn(dsn: string): ParsedDsn | undefined {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '');
    return { protocol: url.protocol.replace(':', ''), host: url.host, projectId, publicKey: url.username };
  } catch {
    return undefined;
  }
}

function getEnvelopeEndpoint(dsn: ParsedDsn): string {
  return `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/?sentry_key=${dsn.publicKey}&sentry_version=7`;
}

function generateEventId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const byte6 = bytes[6];
  const byte8 = bytes[8];
  if (byte6 !== undefined && byte8 !== undefined) {
    bytes[6] = (byte6 & 0x0f) | 0x40;
    bytes[8] = (byte8 & 0x3f) | 0x80;
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function createEASBuildTags(env: EASBuildEnv): Record<string, string> {
  const tags: Record<string, string> = {};
  if (env.EAS_BUILD_PLATFORM) tags['eas.platform'] = env.EAS_BUILD_PLATFORM;
  if (env.EAS_BUILD_PROFILE) tags['eas.profile'] = env.EAS_BUILD_PROFILE;
  if (env.EAS_BUILD_ID) tags['eas.build_id'] = env.EAS_BUILD_ID;
  if (env.EAS_BUILD_PROJECT_ID) tags['eas.project_id'] = env.EAS_BUILD_PROJECT_ID;
  if (env.EAS_BUILD_RUN_FROM_CI) tags['eas.from_ci'] = env.EAS_BUILD_RUN_FROM_CI;
  if (env.EAS_BUILD_STATUS) tags['eas.status'] = env.EAS_BUILD_STATUS;
  if (env.EAS_BUILD_USERNAME) tags['eas.username'] = env.EAS_BUILD_USERNAME;
  return tags;
}

function createEASBuildContext(env: EASBuildEnv): Record<string, unknown> {
  return {
    build_id: env.EAS_BUILD_ID,
    platform: env.EAS_BUILD_PLATFORM,
    profile: env.EAS_BUILD_PROFILE,
    project_id: env.EAS_BUILD_PROJECT_ID,
    git_commit: env.EAS_BUILD_GIT_COMMIT_HASH,
    from_ci: env.EAS_BUILD_RUN_FROM_CI === 'true',
    status: env.EAS_BUILD_STATUS,
    app_version: env.EAS_BUILD_APP_VERSION,
    build_version: env.EAS_BUILD_APP_BUILD_VERSION,
    username: env.EAS_BUILD_USERNAME,
    working_dir: env.EAS_BUILD_WORKINGDIR,
  };
}

function createEnvelope(event: SentryEvent, dsn: ParsedDsn): string {
  const envelopeHeaders = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    dsn: `${dsn.protocol}://${dsn.publicKey}@${dsn.host}/${dsn.projectId}`,
    sdk: event.sdk,
  });
  const itemHeaders = JSON.stringify({ type: 'event', content_type: 'application/json' });
  const itemPayload = JSON.stringify(event);
  return `${envelopeHeaders}\n${itemHeaders}\n${itemPayload}`;
}

async function sendEvent(event: SentryEvent, dsn: ParsedDsn): Promise<boolean> {
  const endpoint = getEnvelopeEndpoint(dsn);
  const envelope = createEnvelope(event, dsn);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    });
    if (response.status >= 200 && response.status < 300) return true;
    console.warn(`[Sentry] Failed to send event: HTTP ${response.status}`);
    return false;
  } catch (error) {
    console.error('[Sentry] Failed to send event:', error);
    return false;
  }
}

function createBaseEvent(
  level: 'error' | 'info' | 'warning',
  env: EASBuildEnv,
  customTags?: Record<string, string>,
): SentryEvent {
  return {
    event_id: generateEventId(),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level,
    logger: 'eas-build-hook',
    environment: 'eas-build',
    release: env.EAS_BUILD_APP_VERSION,
    tags: { ...createEASBuildTags(env), ...customTags },
    contexts: { eas_build: createEASBuildContext(env), runtime: { name: 'node', version: process.version } },
    sdk: { name: 'sentry.javascript.react-native.eas-build-hooks', version: '1.0.0' },
  };
}

/** Captures an EAS build error event. Call this from the eas-build-on-error hook. */
export async function captureEASBuildError(options: EASBuildHookOptions = {}): Promise<void> {
  const dsn = options.dsn ?? process.env[SENTRY_DSN_ENV];
  if (!dsn) {
    console.warn('[Sentry] No DSN provided. Set SENTRY_DSN environment variable or pass dsn option.');
    return;
  }
  if (!isEASBuild()) {
    console.warn('[Sentry] Not running in EAS Build environment. Skipping error capture.');
    return;
  }
  const parsedDsn = parseDsn(dsn);
  if (!parsedDsn) {
    console.error('[Sentry] Invalid DSN format.');
    return;
  }
  const env = getEASBuildEnv();
  const errorMessage =
    options.errorMessage ?? `EAS Build Failed: ${env.EAS_BUILD_PLATFORM ?? 'unknown'} (${env.EAS_BUILD_PROFILE ?? 'unknown'})`;
  const event = createBaseEvent('error', env, { ...options.tags, 'eas.hook': 'on-error' });
  event.exception = {
    values: [{ type: 'EASBuildError', value: errorMessage, mechanism: { type: 'eas-build-hook', handled: true } }],
  };
  event.fingerprint = ['eas-build-error', env.EAS_BUILD_PLATFORM ?? 'unknown', env.EAS_BUILD_PROFILE ?? 'unknown'];
  const success = await sendEvent(event, parsedDsn);
  if (success) console.log('[Sentry] Build error captured.');
}

/** Captures an EAS build success event. Call this from the eas-build-on-success hook. */
export async function captureEASBuildSuccess(options: EASBuildHookOptions = {}): Promise<void> {
  if (!options.captureSuccessfulBuilds) {
    console.log('[Sentry] Skipping successful build capture (captureSuccessfulBuilds is false).');
    return;
  }
  const dsn = options.dsn ?? process.env[SENTRY_DSN_ENV];
  if (!dsn) {
    console.warn('[Sentry] No DSN provided. Set SENTRY_DSN environment variable or pass dsn option.');
    return;
  }
  if (!isEASBuild()) {
    console.warn('[Sentry] Not running in EAS Build environment. Skipping success capture.');
    return;
  }
  const parsedDsn = parseDsn(dsn);
  if (!parsedDsn) {
    console.error('[Sentry] Invalid DSN format.');
    return;
  }
  const env = getEASBuildEnv();
  const successMessage =
    options.successMessage ?? `EAS Build Succeeded: ${env.EAS_BUILD_PLATFORM ?? 'unknown'} (${env.EAS_BUILD_PROFILE ?? 'unknown'})`;
  const event = createBaseEvent('info', env, { ...options.tags, 'eas.hook': 'on-success' });
  event.message = { formatted: successMessage };
  event.fingerprint = ['eas-build-success', env.EAS_BUILD_PLATFORM ?? 'unknown', env.EAS_BUILD_PROFILE ?? 'unknown'];
  const success = await sendEvent(event, parsedDsn);
  if (success) console.log('[Sentry] Build success captured.');
}

/** Captures an EAS build completion event with status. Call this from the eas-build-on-complete hook. */
export async function captureEASBuildComplete(options: EASBuildHookOptions = {}): Promise<void> {
  const env = getEASBuildEnv();
  const status = env.EAS_BUILD_STATUS;
  if (status === 'errored') {
    await captureEASBuildError(options);
    return;
  }
  if (status === 'finished' && options.captureSuccessfulBuilds) {
    await captureEASBuildSuccess({ ...options, captureSuccessfulBuilds: true });
    return;
  }
  console.log(`[Sentry] Build completed with status: ${status ?? 'unknown'}. No event captured.`);
}
