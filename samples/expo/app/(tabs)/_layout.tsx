import { Link, Tabs } from 'expo-router';
import React from 'react';
import { type ColorValue, Pressable, Text } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

function TabBarIcon({ label, color }: { label: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, marginBottom: -3, color }}>{label}</Text>;
}

function CodeIcon({ color }: { color: ColorValue }) {
  return <TabBarIcon label="⌘" color={color} />;
}

function InfoButton({ colorScheme }: { colorScheme: string }) {
  return (
    <Link href="/modal" asChild>
      <Pressable>
        {({ pressed }) => (
          <Text
            style={{
              fontSize: 20,
              color: Colors[colorScheme === 'dark' ? 'dark' : 'light'].text,
              marginRight: 15,
              opacity: pressed ? 0.5 : 1,
            }}
          >
            ⓘ
          </Text>
        )}
      </Pressable>
    </Link>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const theme = colorScheme === 'dark' ? 'dark' : 'light';
  const renderInfoButton = React.useCallback(() => <InfoButton colorScheme={theme} />, [theme]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[theme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tab One',
          tabBarIcon: CodeIcon,
          headerRight: renderInfoButton,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'Tab Two',
          tabBarIcon: CodeIcon,
        }}
      />
    </Tabs>
  );
}
