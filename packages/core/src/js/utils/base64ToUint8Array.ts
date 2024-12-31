/* eslint-disable no-bitwise */
export const base64ToUint8Array = (base64?: string): Uint8Array | undefined => {
  if (!base64) return undefined;

  const cleanedBase64 = base64.replace(/^data:.*;base64,/, ''); // Remove any prefix before the base64 string
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];

  let buffer = 0;
  let bits = 0;

  for (const char of cleanedBase64) {
    if (char === '=') break;

    const value = chars.indexOf(char); // Validate each character
    if (value === -1) return undefined;

    buffer = (buffer << 6) | value; // Shift 6 bits to the left and add the value
    bits += 6;

    if (bits >= 8) {
      // Add a byte when we have 8 or more bits
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
};
