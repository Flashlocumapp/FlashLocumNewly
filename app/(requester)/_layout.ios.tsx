import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';

export default function RequesterLayoutIOS() {
  return (
    <NativeTabs>
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
