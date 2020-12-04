import * as React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import {useSelector, useDispatch} from 'react-redux';

const Counter = () => {
  const counter = useSelector((state) => state.counter);
  const dispatch = useDispatch();

  return (
    <View className="counter">
      <Text>Count:</Text>
      <Text>{counter}</Text>
      <TouchableOpacity
        onPress={() =>
          dispatch({
            type: 'COUNTER_INCREMENT',
          })
        }>
        <Text>Increment</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() =>
          dispatch({
            type: 'COUNTER_RESET',
          })
        }>
        <Text>Reset</Text>
      </TouchableOpacity>
    </View>
  );
};

export default Counter;
