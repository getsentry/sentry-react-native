import * as React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MonoText } from '../StyledText';

it(`renders correctly`, () => {
  render(<MonoText>MonoText Test</MonoText>);

  expect(screen.getAllByLabelText("MonoText Test")).toBeOnTheScreen();
});
