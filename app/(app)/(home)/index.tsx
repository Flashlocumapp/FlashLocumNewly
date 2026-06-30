import { Redirect } from 'expo-router';

export default function HubRedirect() {
  return <Redirect href={'/(doctor)/(home)' as any} />;
}
