import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Lang } from '@/domain/types';
import { useSession } from '@/state/session';

/**
 * The language the UI kit lays out and draws text for. Normally the member's language; an area can
 * override it — the admin console is English-only, so it must stay left-to-right in Latin fonts even
 * when the signed-in admin's app language is Urdu (otherwise punctuation and numbers jump sides).
 */
const Override = createContext<Lang | null>(null);

export function UiLang({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <Override.Provider value={lang}>{children}</Override.Provider>;
}

export function useUiLang(): Lang {
  const override = useContext(Override);
  const lang = useSession((s) => s.lang);
  return override ?? lang;
}

/** `t` for the UI kit: follows the area's language (English inside the admin console). */
export function useUiT() {
  const lang = useUiLang();
  const { i18n } = useTranslation();
  return useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
}
