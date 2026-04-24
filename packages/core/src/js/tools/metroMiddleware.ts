import type { StackFrame } from '@sentry/core';
import type { IncomingMessage, ServerResponse } from 'http';
import type { InputConfigT, Middleware } from 'metro-config';

import { addContextToFrame, debug } from '@sentry/core';
import { readFile } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { SENTRY_CONTEXT_REQUEST_PATH, SENTRY_OPEN_URL_REQUEST_PATH } from '../metro/constants';
import { getRawBody } from '../metro/getRawBody';
import { openURLMiddleware } from '../metro/openUrlMiddleware';

const readFileAsync = promisify(readFile);

/**
 * Accepts Sentry formatted stack frames and
 * adds source context to the in app frames.
 *
 * Filenames are resolved relative to `projectRoot` and must remain within it.
 */
export const createStackFramesContextMiddleware = (projectRoot: string): Middleware => {
  const normalizedRoot = path.resolve(projectRoot);

  return async (request: IncomingMessage, response: ServerResponse, _next: () => void): Promise<void> => {
    debug.log('[@sentry/react-native/metro] Received request for stack frames context.');
    request.setEncoding('utf8');
    const rawBody = await getRawBody(request);

    let body: {
      stack?: Partial<StackFrame>[];
    } = {};
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      debug.log('[@sentry/react-native/metro] Could not parse request body.', e);
      badRequest(response, 'Invalid request body. Expected a JSON object.');
      return;
    }

    const stack = body.stack;
    if (!Array.isArray(stack)) {
      debug.log('[@sentry/react-native/metro] Invalid stack frames.', stack);
      badRequest(response, 'Invalid stack frames. Expected an array.');
      return;
    }

    const stackWithSourceContext = await Promise.all(stack.map(frame => addSourceContext(frame, normalizedRoot)));
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = 200;
    response.end(JSON.stringify({ stack: stackWithSourceContext }));
    debug.log('[@sentry/react-native/metro] Sent stack frames context.');
  };
};

async function addSourceContext(frame: StackFrame, projectRoot: string): Promise<StackFrame> {
  if (!frame.in_app) {
    return frame;
  }

  try {
    if (typeof frame.filename !== 'string') {
      debug.warn('[@sentry/react-native/metro] Could not read source context for frame without filename.');
      return frame;
    }

    const resolvedPath = path.resolve(projectRoot, frame.filename);
    const relative = path.relative(projectRoot, resolvedPath);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      debug.warn('[@sentry/react-native/metro] Skipping frame whose filename is outside the project root.');
      return frame;
    }

    const source = await readFileAsync(resolvedPath, { encoding: 'utf8' });
    const lines = source.split('\n');
    addContextToFrame(lines, frame);
  } catch (error) {
    debug.warn('[@sentry/react-native/metro] Could not read source context for frame.', error);
  }
  return frame;
}

function badRequest(response: ServerResponse, message: string): void {
  response.statusCode = 400;
  response.end(message);
}

/**
 * Creates a middleware that adds source context to the Sentry formatted stack frames.
 */
export const createSentryMetroMiddleware = (middleware: Middleware, projectRoot: string): Middleware => {
  const stackFramesContextMiddleware = createStackFramesContextMiddleware(projectRoot) as (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
  return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.startsWith(`/${SENTRY_CONTEXT_REQUEST_PATH}`)) {
      return stackFramesContextMiddleware(request, response, next);
    } else if (request.url?.startsWith(`/${SENTRY_OPEN_URL_REQUEST_PATH}`)) {
      return openURLMiddleware(request, response);
    }
    return (middleware as (req: IncomingMessage, res: ServerResponse, next: () => void) => void)(
      request,
      response,
      next,
    );
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

  const projectRoot = (config as { projectRoot?: string }).projectRoot || process.cwd();
  const originalEnhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) => {
    const sentryMiddleware = createSentryMetroMiddleware(middleware, projectRoot);
    return originalEnhanceMiddleware ? originalEnhanceMiddleware(sentryMiddleware, server) : sentryMiddleware;
  };
  return config;
};
