import { StyleSheet } from 'react-native';
import { Text, TextProps } from './Themed';

export function MonoText(props: TextProps) {
  return <Text {...props} style={[props.style, styles.monoText]} />;
}

const styles = StyleSheet.create({
  monoText: {
    fontFamily: 'SpaceMono',
  },
});
