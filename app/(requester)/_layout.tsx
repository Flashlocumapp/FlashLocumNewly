import React from 'react';
import { Stack } from 'expo-router';

export default function RequesterLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(home)" />
      <Stack.Screen name="(coverage)" />
      <Stack.Screen name="(account)" />
    </Stack>
  );
}
