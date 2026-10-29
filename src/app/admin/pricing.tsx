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
import { boostPlansFor, feeLabel, MAX_BOOST_PLANS, pricingCopy, validatePricing } from '@/domain/pricing';
import type { BoostPlan, Fee, PricingConfig, ProfileType } from '@/domain/types';
import { qk, usePricing } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

const MODES = [
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
  { value: 'disabled', label: 'Disabled' },
];

/** "7d ₹100 · 14d ₹200" for one type — used in the change history. */
const planSummary = (c: PricingConfig, type: ProfileType) =>
  (c.boostPlans ?? []).map((p) => `${p.days}d ${p.enabled ? feeLabel(p.fee[type], c.currency) : 'off'}${p.popular ? '★' : ''}`).join(', ') || '—';

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
  const setFee = (kind: 'publication', type: ProfileType, patch: Partial<Fee>) =>
    setCfg({ ...cfg, [kind]: { ...cfg[kind], [type]: { ...cfg[kind][type], ...patch } } });
  const setPlan = (i: number, patch: Partial<BoostPlan>) => setCfg({ ...cfg, boostPlans: cfg.boostPlans.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setPlanFee = (i: number, type: ProfileType, patch: Partial<Fee>) => {
    const p = cfg.boostPlans[i];
    setPlan(i, { fee: { ...p.fee, [type]: { ...p.fee[type], ...patch } } });
  };
  const addPlan = () => {
    const days = Math.min(90, Math.max(0, ...cfg.boostPlans.map((p) => p.days)) + 7);
    const fee: Fee = { mode: 'paid', amount: 100 };
    setCfg({ ...cfg, boostPlans: [...cfg.boostPlans, { id: `o${Date.now().toString(36)}`, days, fee: { bride: fee, groom: fee }, enabled: true, popular: false }] });
  };
  const removePlan = (i: number) => setCfg({ ...cfg, boostPlans: cfg.boostPlans.filter((_, j) => j !== i) });

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

  const feeBox = (label: string, fee: Fee, onChange: (patch: Partial<Fee>) => void, a11y: string) => (
    <View style={{ flex: 1, minWidth: 220, gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <ChipGroup options={MODES} value={fee.mode} onChange={(v) => v && onChange({ mode: v })} />
      {fee.mode === 'paid' ? (
        <TextField value={String(fee.amount || '')} onChangeText={(v) => onChange({ amount: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" placeholder="Amount (INR)" accessibilityLabel={a11y} />
      ) : null}
    </View>
  );
  const feeEditor = (kind: 'publication', type: ProfileType) =>
    feeBox(type === 'bride' ? 'Brides' : 'Grooms', cfg[kind][type], (patch) => setFee(kind, type, patch), `${kind} ${type} amount`);

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
      <Section title="Boost options">
        <View style={{ gap: space.md }}>
          <Text variant="caption">Members choose one of these on the Boost screen; the shortest available option is pre-selected. Free options skip payment. Set a type to Disabled to hide that option from brides or grooms.</Text>
          {cfg.boostPlans.map((p, i) => (
            <Card key={p.id} style={{ gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }} wrap gap={space.sm}>
                <Text variant="h3">{p.days ? `${p.days}-day boost` : 'New boost option'}</Text>
                <Button label="Remove" kind="ghost" size="sm" onPress={() => removePlan(i)} disabled={cfg.boostPlans.length <= 1} testID={`plan-remove-${i}`} />
              </Row>
              <Field label="Duration (days)" hint="1–90 days. Each option needs a different duration.">
                <TextField value={String(p.days || '')} onChangeText={(v) => setPlan(i, { days: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" accessibilityLabel={`Option ${i + 1} duration in days`} testID={`plan-days-${i}`} />
              </Field>
              <Row gap={space.lg} wrap style={{ alignItems: 'flex-start' }}>
                {feeBox('Brides', p.fee.bride, (patch) => setPlanFee(i, 'bride', patch), `Option ${i + 1} bride price`)}
                {feeBox('Grooms', p.fee.groom, (patch) => setPlanFee(i, 'groom', patch), `Option ${i + 1} groom price`)}
              </Row>
              <ToggleRow label="Offered to members" value={p.enabled} onChange={(v) => setPlan(i, { enabled: v })} hint="Off: hidden from the Boost screen. Existing orders are unaffected." />
              <ToggleRow
                label="Show a “Popular” label"
                value={p.popular}
                onChange={(v) => setCfg({ ...cfg, boostPlans: cfg.boostPlans.map((x, j) => ({ ...x, popular: j === i ? v : v ? false : x.popular })) })}
                hint="Use only when it is true (e.g. most chosen). At most one option."
              />
            </Card>
          ))}
          {cfg.boostPlans.length < MAX_BOOST_PLANS ? <Button label="Add a boost option" kind="secondary" onPress={addPlan} testID="plan-add" /> : null}
        </View>
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
                Publication: {feeLabel(cfg.publication[type], cfg.currency)} · Boost options:{' '}
                {boostPlansFor(cfg, type).map((p) => `${p.days} days ${p.label}`).join(' · ') || 'none'}
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
                {formatDate(h.at, 'en')} · v{h.before.version} → v{h.after.version} by {h.adminId} · boost bride {planSummary(h.before, 'bride')} → {planSummary(h.after, 'bride')} · boost groom {planSummary(h.before, 'groom')} → {planSummary(h.after, 'groom')} · pub bride {feeLabel(h.before.publication.bride, 'INR')} → {feeLabel(h.after.publication.bride, 'INR')} · pub groom {feeLabel(h.before.publication.groom, 'INR')} → {feeLabel(h.after.publication.groom, 'INR')}
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
