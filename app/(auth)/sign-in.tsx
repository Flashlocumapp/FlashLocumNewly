import { Redirect } from 'expo-router';

export default function SignIn() {
  return <Redirect href="/(auth)/sign-up?mode=signin" />;
}
