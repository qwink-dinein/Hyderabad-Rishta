import type { QueryClient } from '@tanstack/react-query';
import { changeLanguage } from '@/components/LanguageSwitcher';
import { applyAnswers, type OnboardingAnswers } from '@/domain/onboarding';
import type { Lang, Profile, User } from '@/domain/types';
import { emptyBiodata } from '@/domain/validation';
import { backend } from '@/services';
import { useSession } from '@/state/session';

/** Signed in from the onboarding: keep the language chosen before login, never leak cached data. */
export async function enterSession(user: User, lang: Lang, qc: QueryClient) {
  qc.clear();
  if (user.language !== lang) await backend.setLanguage(lang).catch(() => undefined);
  useSession.getState().setUser({ ...user, language: lang });
  await changeLanguage(lang);
}

/**
 * After the number is verified: put the pre-sign-up answers into the member's biodata draft (never over
 * answers already saved), so nothing is asked twice. Returns the member's profile, if any.
 */
export async function seedDraft(answers: OnboardingAnswers): Promise<Profile | null> {
  const mine = await backend.getMyProfile().catch(() => null);
  if (mine && mine.status !== 'draft' && mine.status !== 'rejected') return mine; // already live / in review
  const base = mine?.biodata ?? emptyBiodata();
  const seeded = applyAnswers(base, answers);
  return backend.saveDraft(seeded, mine?.lastStep ?? 0);
}
