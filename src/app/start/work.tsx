import { Redirect } from 'expo-router';

/** Old 3-screen onboarding step, now one question per screen: continue at its first question. */
export default function Legacy() {
  return <Redirect href="/start/q/education" />;
}
