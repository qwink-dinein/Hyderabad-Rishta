import { subjectOf } from '@/domain/onboarding';
import { useOnboarding } from '@/state/onboarding';

/**
 * Who the biodata is about, for wording: `ctx` picks i18n variants (key_he / key_she / key_you) and
 * `side` is the side being looked for ('bride' | 'groom').
 */
export function useSubject() {
  const a = useOnboarding((s) => s.answers);
  const ctx = subjectOf(a.createdFor ?? 'self', a.lookingFor);
  return { ctx, side: a.lookingFor, createdFor: a.createdFor ?? 'self', answers: a };
}
