import { Redirect } from 'expo-router';

/** Unknown paths (old links, hosted previews served under a sub-path) go to the start screen. */
export default function NotFound() {
  return <Redirect href="/" />;
}
