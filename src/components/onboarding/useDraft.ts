import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useMyProfile } from '@/hooks/queries';
import type { Biodata } from '@/domain/types';
import { emptyBiodata, stepErrors } from '@/domain/validation';
import { backend } from '@/services';

/**
 * The member's biodata while onboarding: loaded from the server, edited locally, saved on every Next
 * (so leaving halfway loses nothing). `errorsFor` returns the step's validation errors for given fields only.
 */
export function useDraft() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useMyProfile();
  const [edited, setBd] = useState<Biodata | null>(null);
  // Until the member edits something, show the saved biodata (or an empty one).
  const loaded = useMemo(() => (profile === undefined ? null : profile?.biodata ? (JSON.parse(JSON.stringify(profile.biodata)) as Biodata) : emptyBiodata()), [profile]);
  const bd = edited ?? loaded;
  const save = async (next: Biodata) => {
    const saved = await backend.saveDraft(next, Math.max(profile?.lastStep ?? 0, 0));
    qc.setQueryData(qk.myProfile, saved);
    return saved;
  };
  const errorsFor = (b: Biodata, step: number, section: keyof Biodata, fields: string[]) => {
    const all = stepErrors(step, b[section]);
    return Object.fromEntries(Object.entries(all).filter(([k]) => fields.includes(k.split('.')[0])));
  };
  return { bd, setBd, profile, loading: isLoading || !bd, save, errorsFor };
}
