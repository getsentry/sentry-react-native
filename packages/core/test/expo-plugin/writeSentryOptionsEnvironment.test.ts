import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeSentryOptionsEnvironment } from '../../plugin/src/utils';

jest.mock('../../plugin/src/logger');

describe('writeSentryOptionsEnvironment', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-options-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates sentry.options.json with environment when file does not exist', () => {
    writeSentryOptionsEnvironment(tempDir, 'staging');

    const filePath = path.join(tempDir, 'sentry.options.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content).toEqual({ environment: 'staging' });
  });

  test('sets environment in existing sentry.options.json', () => {
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, JSON.stringify({ dsn: 'https://key@sentry.io/123', environment: 'production' }));

    writeSentryOptionsEnvironment(tempDir, 'staging');

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content.environment).toBe('staging');
    expect(content.dsn).toBe('https://key@sentry.io/123');
  });

  test('adds environment to existing sentry.options.json without environment', () => {
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, JSON.stringify({ dsn: 'https://key@sentry.io/123' }));

    writeSentryOptionsEnvironment(tempDir, 'staging');

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(content.environment).toBe('staging');
    expect(content.dsn).toBe('https://key@sentry.io/123');
  });

  test('does not crash and warns when sentry.options.json contains invalid JSON', () => {
    const { warnOnce } = require('../../plugin/src/logger');
    const filePath = path.join(tempDir, 'sentry.options.json');
    fs.writeFileSync(filePath, 'invalid json{{{');

    writeSentryOptionsEnvironment(tempDir, 'staging');

    expect(warnOnce).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    // File should remain unchanged
    expect(fs.readFileSync(filePath, 'utf8')).toBe('invalid json{{{');
  });
});
