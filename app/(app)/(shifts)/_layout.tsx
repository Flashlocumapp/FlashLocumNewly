import { Stack } from 'expo-router';

export default function ShiftsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerBlurEffect: 'none',
        headerLargeTitle: true,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
