import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as O from '@/domain/options';
import { formatHeight } from '@/domain/format';
import type { Option } from '@/components/ui/forms';

type Group = 'createdFor' | 'lookingFor' | 'marital' | 'tongue' | 'education' | 'profession' | 'employment' | 'income' | 'relocate' | 'maslak' | 'practice' | 'yesNo' | 'importance' | 'familyType' | 'familyValues' | 'visibility' | 'displayName' | 'report';

const SOURCES: Record<Group, readonly string[]> = {
  createdFor: O.CREATED_FOR,
  lookingFor: ['bride', 'groom'],
  marital: O.MARITAL_STATUS,
  tongue: O.MOTHER_TONGUES,
  education: O.EDUCATION,
  profession: O.PROFESSION,
  employment: O.EMPLOYMENT_TYPE,
  income: O.INCOME_BANDS,
  relocate: O.RELOCATE,
  maslak: O.MASLAK,
  practice: O.PRACTICE,
  yesNo: O.YES_NO_PNS,
  importance: O.IMPORTANCE,
  familyType: O.FAMILY_TYPE,
  familyValues: O.FAMILY_VALUES,
  visibility: O.VISIBILITY,
  displayName: ['full', 'first', 'initials'],
  report: O.REPORT_REASONS,
};

/** Translated option lists. Re-computed when the language changes. */
export function useOptions() {
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const opts = (g: Group): Option[] => SOURCES[g].map((v) => ({ value: v, label: t(`opt.${g}.${v}`) }));
    const label = (g: Group, v?: string, other?: string) => {
      if (!v) return undefined;
      if (v === 'other' && other) return other; // custom values display verbatim
      return t(`opt.${g}.${v}`, { defaultValue: v });
    };
    const heights: Option[] = O.HEIGHTS_CM.map((cm) => ({ value: String(cm), label: formatHeight(cm) }));
    const ages: Option[] = Array.from({ length: 53 }, (_, i) => ({ value: String(18 + i), label: String(18 + i) }));
    const plain = (list: string[]): Option[] => list.map((v) => ({ value: v, label: v }));
    return { opts, label, heights, ages, plain };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language]);
}
