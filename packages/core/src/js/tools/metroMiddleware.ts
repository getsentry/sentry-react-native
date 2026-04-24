import type { StackFrame } from '@sentry/core';
import type { IncomingMessage, ServerResponse } from 'http';
import type { InputConfigT, Middleware } from 'metro-config';

import { addContextToFrame, debug } from '@sentry/core';
import { readFile, realpath, realpathSync } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { SENTRY_CONTEXT_REQUEST_PATH, SENTRY_OPEN_URL_REQUEST_PATH } from '../metro/constants';
import { getRawBody } from '../metro/getRawBody';
import { openURLMiddleware } from '../metro/openUrlMiddleware';

const readFileAsync = promisify(readFile);
const realpathAsync = promisify(realpath);

/**
 * Accepts Sentry formatted stack frames and
 * adds source context to the in app frames.
 *
 * Relative filenames are resolved against the first entry in `allowedRoots`.
 * Both the resolved filename and the allowed roots are canonicalized via
 * `fs.realpath`, so a symlink inside an allowed root pointing outside of it
 * cannot escape the containment check.
 */
export const createStackFramesContextMiddleware = (allowedRoots: string[]): Middleware => {
  const canonicalRoots = allowedRoots.map(root => {
    const resolved = path.resolve(root);
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  });

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

    const stackWithSourceContext = await Promise.all(stack.map(frame => addSourceContext(frame, canonicalRoots)));
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = 200;
    response.end(JSON.stringify({ stack: stackWithSourceContext }));
    debug.log('[@sentry/react-native/metro] Sent stack frames context.');
  };
};

async function addSourceContext(frame: StackFrame, canonicalRoots: string[]): Promise<StackFrame> {
  if (!frame.in_app) {
    return frame;
  }

  try {
    if (typeof frame.filename !== 'string') {
      debug.warn('[@sentry/react-native/metro] Could not read source context for frame without filename.');
      return frame;
    }

    if (canonicalRoots.length === 0) {
      debug.warn('[@sentry/react-native/metro] Skipping frame: no allowed roots configured.');
      return frame;
    }

    const resolvedPath = path.resolve(canonicalRoots[0]!, frame.filename);
    let canonicalPath: string;
    try {
      canonicalPath = await realpathAsync(resolvedPath);
    } catch {
      debug.warn('[@sentry/react-native/metro] Skipping frame: could not canonicalize filename.');
      return frame;
    }

    const isInside = canonicalRoots.some(root => {
      const relative = path.relative(root, canonicalPath);
      return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    if (!isInside) {
      debug.warn('[@sentry/react-native/metro] Skipping frame whose filename is outside the allowed roots.');
      return frame;
    }

    const source = await readFileAsync(canonicalPath, { encoding: 'utf8' });
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
export const createSentryMetroMiddleware = (middleware: Middleware, allowedRoots: string[]): Middleware => {
  const stackFramesContextMiddleware = createStackFramesContextMiddleware(allowedRoots) as (
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

  const projectRoot = config.projectRoot || process.cwd();
  const watchFolders = config.watchFolders || [];
  const allowedRoots = [projectRoot, ...watchFolders];

  const originalEnhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) => {
    const sentryMiddleware = createSentryMetroMiddleware(middleware, allowedRoots);
    return originalEnhanceMiddleware ? originalEnhanceMiddleware(sentryMiddleware, server) : sentryMiddleware;
  };
  return config;
};
