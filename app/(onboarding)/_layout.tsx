import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="doctor/basic-profile" />
      <Stack.Screen name="doctor/credentials" />
      <Stack.Screen name="doctor/payout" />
      <Stack.Screen name="requester/basic-profile" />
    </Stack>
  );
}
