import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { writeSentryOptions } from '../../plugin/src/utils';

jest.mock('../../plugin/src/logger');

describe('writeSentryOptions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-options-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates sentry.options.json when file does not exist', () => {
    writeSentryOptions(tempDir, { dsn: 'https://key@sentry.io/123', environment: 'staging' });

    const filePath = path.join(tempDir, 'sentry.options.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content).toEqual({ dsn: 'https://key@sentry.io/123', environment: 'staging' });
  });

  test('merges options into existing sentry.options.json', () => {
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, JSON.stringify({ dsn: 'https://key@sentry.io/123', environment: 'production' }));

    writeSentryOptions(tempDir, { environment: 'staging', debug: true });

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content).toEqual({ dsn: 'https://key@sentry.io/123', environment: 'staging', debug: true });
  });

  test('plugin options take precedence over existing file values', () => {
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, JSON.stringify({ dsn: 'https://old@sentry.io/1', debug: false }));

    writeSentryOptions(tempDir, { dsn: 'https://new@sentry.io/2' });

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content.dsn).toBe('https://new@sentry.io/2');
    expect(content.debug).toBe(false); // preserved from existing file
  });

  test('does not crash and warns when sentry.options.json contains invalid JSON', () => {
    const { warnOnce } = require('../../plugin/src/logger');
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, 'invalid json{{{');

    writeSentryOptions(tempDir, { environment: 'staging' });

    expect(warnOnce).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    // File should remain unchanged
    expect(fs.readFileSync(filePath, 'utf8')).toBe('invalid json{{{');
  });

  test('writes multiple options at once', () => {
    writeSentryOptions(tempDir, {
      dsn: 'https://key@sentry.io/123',
      debug: true,
      tracesSampleRate: 0.5,
      environment: 'production',
    });

    const filePath = path.join(tempDir, 'sentry.options.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content).toEqual({
      dsn: 'https://key@sentry.io/123',
      debug: true,
      tracesSampleRate: 0.5,
      environment: 'production',
    });
  });
});
