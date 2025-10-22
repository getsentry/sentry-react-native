import type { Primitive } from '@sentry/core';

/**
 * Converts primitive to string.
 */
export function PrimitiveToString(primitive: Primitive): string | undefined {
  if (primitive === null) {
    return '';
  }

  switch (typeof primitive) {
    case 'string':
      return primitive;
    case 'boolean':
      return primitive == true ? 'True' : 'False';
    case 'number':
    case 'bigint':
      return `${primitive}`;
    case 'undefined':
      return undefined;
    case 'symbol':
      return primitive.toString();
    default:
      return primitive as string;
  }
}
