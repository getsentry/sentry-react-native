import type { IncomingMessage } from 'http';

/**
 * Get the raw body of a request.
 */
export function getRawBody(request: IncomingMessage): Promise<string> {
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
