import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';

import { openURLMiddleware } from '../../src/js/metro/openUrlMiddleware';

jest.mock('../../src/js/metro/openUrlMiddleware', () => jest.requireActual('../../src/js/metro/openUrlMiddleware'));

let mockOpen: jest.Mock | undefined;

jest.mock('open', () => {
  mockOpen = jest.fn().mockResolvedValue(undefined);
  return mockOpen;
});

function createRequest(method: string, body: string) {
  return {
    method,
    on: jest.fn((event: string, cb: (data?: string) => void) => {
      if (event === 'data') {
        cb(body);
      } else if (event === 'end') {
        cb();
      }
    }),
  } as any;
}

function createResponse() {
  return {
    writeHead: jest.fn(),
    end: jest.fn(),
  } as any;
}

describe('openURLMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const req = createRequest('GET', '');
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(405);
  });

  it('should return 400 for invalid JSON body', async () => {
    const req = createRequest('POST', 'not json');
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('should return 400 for missing url in body', async () => {
    const req = createRequest('POST', '{}');
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(400);
  });

  it('should return 400 for non-http URL schemes', async () => {
    const req = createRequest('POST', JSON.stringify({ url: 'file:///etc/passwd' }));
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(400);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Invalid URL scheme'));
  });

  it('should open sentry.io URLs', async () => {
    const req = createRequest('POST', JSON.stringify({ url: 'https://sentry.io/issues/' }));
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(mockOpen).toHaveBeenCalledWith('https://sentry.io/issues/');
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('should open subdomain.sentry.io URLs', async () => {
    const req = createRequest('POST', JSON.stringify({ url: 'https://my-org.sentry.io/issues/?project=123' }));
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(mockOpen).toHaveBeenCalledWith('https://my-org.sentry.io/issues/?project=123');
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('should not auto-open non-sentry.io URLs and log to console instead', async () => {
    const req = createRequest('POST', JSON.stringify({ url: 'https://example.com/malicious' }));
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(mockOpen).not.toHaveBeenCalled();
    expect(res.writeHead).toHaveBeenCalledWith(200);
  });

  it('should return 500 when open fails', async () => {
    mockOpen!.mockRejectedValueOnce(new Error('open failed'));
    const req = createRequest('POST', JSON.stringify({ url: 'https://sentry.io/' }));
    const res = createResponse();

    await openURLMiddleware(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(500);
  });
});
