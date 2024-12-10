import React from 'react';
import type { TextStyle } from 'react-native';
import { Text } from 'react-native';

interface LabelTextProps {
  label: string;
  isRequired: boolean;
  isRequiredLabel: string;
  styles: TextStyle;
}

const LabelText: React.FC<LabelTextProps> = ({ label, isRequired, isRequiredLabel, styles }) => {
  return (
    <Text style={styles}>
      {label}
      {isRequired && ` ${isRequiredLabel}`}
    </Text>
  );
};

export default LabelText;
