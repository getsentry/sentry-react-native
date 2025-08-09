import * as React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { useDispatch, useSelector } from 'react-redux';

import { increment, IRootState, reset } from '../store';

const Counter = () => {
  const count = useSelector((state: IRootState) => state.counter.value);
  const dispatch = useDispatch();

  return (
    <View>
      <Text>Count:</Text>
      <Text>{count}</Text>
      <TouchableOpacity onPress={() => dispatch(increment())}>
        <Text>Increment</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => dispatch(reset())}>
        <Text>Reset</Text>
      </TouchableOpacity>
    </View>
  );
};

export default Counter;
