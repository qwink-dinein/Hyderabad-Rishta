import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, Field, TextField, ToggleRow } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { feeLabel, pricingCopy, validatePricing } from '@/domain/pricing';
import type { Fee, PricingConfig, ProfileType } from '@/domain/types';
import { qk, usePricing } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

const MODES = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
  { value: 'disabled', label: 'Disabled' },
];

/** Admin pricing (PRD §8): one config drives every price on every screen; changes are audited. */
export default function AdminPricing() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data: current } = usePricing();
  const { data: history } = useQuery({ queryKey: qk.admin('pricingHistory'), queryFn: () => backend.adminPricingHistory() });
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [busy, setBusy] = useState(false);

  if (current && !cfg) setCfg(current); // initialise once from the loaded config (during render, not in an effect)
  if (!cfg) return <Loading />;

  const errors = validatePricing(cfg);
  const setFee = (kind: 'publication' | 'boost', type: ProfileType, patch: Partial<Fee>) =>
    setCfg({ ...cfg, [kind]: { ...cfg[kind], [type]: { ...cfg[kind][type], ...patch } } });

  const save = async () => {
    setBusy(true);
    try {
      const next = await backend.adminUpdatePricing(cfg);
      setCfg(next);
      qc.invalidateQueries({ queryKey: qk.pricing });
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`Pricing saved (v${next.version}). All screens now use it.`);
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const feeEditor = (kind: 'publication' | 'boost', type: ProfileType) => {
    const fee = cfg[kind][type];
    return (
      <View style={{ flex: 1, minWidth: 220, gap: space.sm }}>
        <Text variant="label">{type === 'bride' ? 'Brides' : 'Grooms'}</Text>
        <ChipGroup options={MODES} value={fee.mode} onChange={(v) => v && setFee(kind, type, { mode: v })} />
        {fee.mode === 'paid' ? (
          <TextField value={String(fee.amount || '')} onChangeText={(v) => setFee(kind, type, { amount: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" placeholder="Amount (INR)" accessibilityLabel={`${kind} ${type} amount`} />
        ) : null}
      </View>
    );
  };

  return (
    <Screen header={<Header title="Pricing & boosts" />} footer={<Button label="Save pricing" onPress={save} loading={busy} disabled={errors.length > 0} full />}>
      <View style={{ paddingTop: space.lg }}>
        <Banner icon="shield">Existing orders keep their original price and terms. There is never automatic renewal.</Banner>
      </View>
      <Section title="Publication fee">
        <Card>
          <Row gap={space.lg} wrap style={{ alignItems: 'flex-start' }}>
            {feeEditor('publication', 'bride')}
            {feeEditor('publication', 'groom')}
          </Row>
        </Card>
      </Section>
      <Section title="Boost fee">
        <Card style={{ gap: space.md }}>
          <Row gap={space.lg} wrap style={{ alignItems: 'flex-start' }}>
            {feeEditor('boost', 'bride')}
            {feeEditor('boost', 'groom')}
          </Row>
          <Field label="Boost duration (days)">
            <TextField value={String(cfg.boostDays || '')} onChangeText={(v) => setCfg({ ...cfg, boostDays: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" accessibilityLabel="Boost duration in days" />
          </Field>
        </Card>
      </Section>
      <Section title="Connections (interest requests)">
        <Card style={{ gap: space.sm }}>
          {(
            [
              ['requestExpiryDays', 'Pending interest expires after (days)', '1–90. Expired requests can no longer be accepted; the sender may send a new one.'],
              ['pokeWaitHours', 'Gentle reminder available after (hours)', 'How long a request must stay unanswered before the sender can poke once.'],
              ['pokeMaxPer7Days', 'Max reminders to the same person per 7 days', 'Across all requests to that person (0 disables reminders).'],
            ] as const
          ).map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <TextField value={String(cfg[key] ?? '')} onChangeText={(v) => setCfg({ ...cfg, [key]: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" accessibilityLabel={label} />
            </Field>
          ))}
        </Card>
      </Section>
      <Section title="Publication workflow">
        <ToggleRow label="Require admin approval before publishing" value={cfg.requireApproval} onChange={(v) => setCfg({ ...cfg, requireApproval: v })} hint="Off: profiles go live as soon as they are submitted (and paid, if applicable)." />
      </Section>
      {errors.length ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="danger">{errors.join('\n')}</Banner>
        </View>
      ) : null}
      <Section title="Live copy preview (generated)">
        {(['bride', 'groom'] as const).map((type) => {
          const c = pricingCopy(cfg, type);
          return (
            <Card key={type} style={{ gap: 4 }}>
              <Text variant="label">{type === 'bride' ? 'Bride profiles' : 'Groom profiles'}</Text>
              <Text variant="caption">
                Publication: {feeLabel(cfg.publication[type], cfg.currency)} · Boost: {feeLabel(cfg.boost[type], cfg.currency)}
              </Text>
              <Text variant="body">{t(c.key, c.params)}</Text>
            </Card>
          );
        })}
      </Section>
      <Section title="Change history">
        <Card style={{ gap: space.sm }}>
          {history?.length ? (
            history.map((h) => (
              <Text key={h.id} variant="caption">
                {formatDate(h.at, 'en')} · v{h.before.version} → v{h.after.version} by {h.adminId} · boost {h.before.boostDays}d → {h.after.boostDays}d · pub bride {feeLabel(h.before.publication.bride, 'INR')} → {feeLabel(h.after.publication.bride, 'INR')} · pub groom {feeLabel(h.before.publication.groom, 'INR')} → {feeLabel(h.after.publication.groom, 'INR')}
              </Text>
            ))
          ) : (
            <Text variant="caption">No changes yet.</Text>
          )}
        </Card>
      </Section>
    </Screen>
  );
}
