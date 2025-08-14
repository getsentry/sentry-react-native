/**
 * @format
 */

import React from 'react';

// Note: import explicitly to use the types shipped with jest.
import { it } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

it('dummy test', () => {
  render(<Text>Test</Text>);
});
