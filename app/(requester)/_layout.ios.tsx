import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function RequesterLayoutIOS() {
  return (
    <NativeTabs
      tabBarStyle={{ backgroundColor: '#1C1C1E' }}
      tabBarActiveTintColor="#FFFFFF"
      tabBarInactiveTintColor="#8E8E93"
    >
      <NativeTabs.Trigger name="(home)">
        <Icon sf="house.fill" />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(coverage)">
        <Icon sf="clock" />
        <Label>Coverage</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(account)">
        <Icon sf="person.fill" />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
