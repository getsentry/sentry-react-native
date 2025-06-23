import { element, by } from 'detox';

export const tap = async (text: string) => {
  await element(by.text(createFlexibleRegex(text))).tap();
};

/**
 * Creates regex that matches case insensitive and allows flexible spacing between words
 */
function createFlexibleRegex(input: string) {
  const words = input.trim().split(/\s+/);
  const pattern = words.join('\\s*');
  return new RegExp(pattern, 'i');
}
