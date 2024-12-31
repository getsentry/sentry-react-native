import type { StackFrame } from '@sentry/core';
import { addContextToFrame, logger } from '@sentry/core';
import { readFile } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import type { InputConfigT, Middleware } from 'metro-config';
import { promisify } from 'util';

const readFileAsync = promisify(readFile);

/**
 * Accepts Sentry formatted stack frames and
 * adds source context to the in app frames.
 */
export const stackFramesContextMiddleware: Middleware = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  logger.debug('[@sentry/react-native/metro] Received request for stack frames context.');
  request.setEncoding('utf8');
  const rawBody = await getRawBody(request);

  let body: {
    stack?: Partial<StackFrame>[];
  } = {};
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    logger.debug('[@sentry/react-native/metro] Could not parse request body.', e);
    badRequest(response, 'Invalid request body. Expected a JSON object.');
    return;
  }

  const stack = body.stack;
  if (!Array.isArray(stack)) {
    logger.debug('[@sentry/react-native/metro] Invalid stack frames.', stack);
    badRequest(response, 'Invalid stack frames. Expected an array.');
    return;
  }

  const stackWithSourceContext = await Promise.all(stack.map(addSourceContext));
  response.setHeader('Content-Type', 'application/json');
  response.statusCode = 200;
  response.end(JSON.stringify({ stack: stackWithSourceContext }));
  logger.debug('[@sentry/react-native/metro] Sent stack frames context.');
};

async function addSourceContext(frame: StackFrame): Promise<StackFrame> {
  if (!frame.in_app) {
    return frame;
  }

  try {
    if (typeof frame.filename !== 'string') {
      logger.warn('[@sentry/react-native/metro] Could not read source context for frame without filename.');
      return frame;
    }

    const source = await readFileAsync(frame.filename, { encoding: 'utf8' });
    const lines = source.split('\n');
    addContextToFrame(lines, frame);
  } catch (error) {
    logger.warn('[@sentry/react-native/metro] Could not read source context for frame.', error);
  }
  return frame;
}

function badRequest(response: ServerResponse, message: string): void {
  response.statusCode = 400;
  response.end(message);
}

function getRawBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', chunk => {
      data += chunk;
    });
    request.on('end', () => {
      resolve(data);
    });
    request.on('error', reject);
  });
}

const SENTRY_MIDDLEWARE_PATH = '/__sentry';
const SENTRY_CONTEXT_REQUEST_PATH = `${SENTRY_MIDDLEWARE_PATH}/context`;

/**
 * Creates a middleware that adds source context to the Sentry formatted stack frames.
 */
export const createSentryMetroMiddleware = (middleware: Middleware): Middleware => {
  return (request: IncomingMessage, response: ServerResponse, next: unknown) => {
    if (request.url?.startsWith(SENTRY_CONTEXT_REQUEST_PATH)) {
      return stackFramesContextMiddleware(request, response);
    }
    return middleware(request, response, next);
  };
};

/**
 * Adds the Sentry middleware to the Metro server config.
 */
export const withSentryMiddleware = (config: InputConfigT): InputConfigT => {
  if (!config.server) {
    // @ts-expect-error server is typed read only
    config.server = {};
  }

  const originalEnhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) => {
    const sentryMiddleware = createSentryMetroMiddleware(middleware);
    return originalEnhanceMiddleware ? originalEnhanceMiddleware(sentryMiddleware, server) : sentryMiddleware;
  };
  return config;
};
