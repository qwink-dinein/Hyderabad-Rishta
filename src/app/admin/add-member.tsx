import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, useErrorMessage } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { COUNTRY_CODES } from '@/domain/options';
import { qk } from '@/hooks/queries';
import { backend, type AdminPhoneCheck } from '@/services';
import { space } from '@/theme/tokens';

/**
 * Admin / sub-admin: add a member for any phone number, no OTP (owner request 2026-10-29).
 * When the owner of that number later logs in with OTP, they get this account and biodata.
 */
export default function AddMember() {
  const errMsg = useErrorMessage();
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [check, setCheck] = useState<AdminPhoneCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: users } = useQuery({ queryKey: qk.admin('users'), queryFn: () => backend.adminListUsers() });
  const added = (users ?? []).filter((u) => u.createdBy).slice(0, 20);

  const run = async () => {
    setBusy(true);
    setError(null);
    setCheck(null);
    try {
      setCheck(await backend.adminCheckPhone(cc, phone));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title="Add a member" />}>
      <View style={{ paddingTop: space.lg, gap: space.md }}>
        <Banner icon="info">
          {'Add a biodata for any phone number — no OTP needed. When the owner of this number logs in with their own OTP, they get this account and see this biodata. One number = one account: a number that is already registered cannot be added again.'}
        </Banner>
        <Card style={{ gap: space.md }}>
          <Field label="Member's phone number" error={error ?? undefined}>
            <View style={styles.phoneRow}>
              <Select
                label="Country code"
                options={COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }))}
                value={cc}
                onChange={(v) => {
                  setCc(v);
                  setCheck(null);
                }}
                displayValue={(v) => v[0]}
                style={styles.cc}
              />
              <View style={{ flex: 1 }}>
                <TextField
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    setCheck(null);
                  }}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  placeholder="10-digit mobile number"
                  accessibilityLabel="Member's phone number"
                  onSubmitEditing={run}
                  testID="add-phone"
                />
              </View>
            </View>
          </Field>
          <Button label="Check number" onPress={run} loading={busy} disabled={phone.replace(/\D/g, '').length < 6} testID="add-check" />
          {check && !check.available ? (
            <View style={{ gap: space.sm }} testID="add-taken">
              <Banner tone="danger" icon="ban">
                {`${check.countryCode} ${check.phone} already has an account. Open that member instead of adding a duplicate.`}
              </Banner>
              {check.existingUserId ? <Button label="Open that member" kind="secondary" size="sm" onPress={() => router.push(`/admin/member/${check.existingUserId}`)} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          ) : null}
          {check?.available ? (
            <View style={{ gap: space.sm }} testID="add-free">
              <Banner tone="success" icon="check">
                {`${check.countryCode} ${check.phone} is free. Next, fill in the biodata (you can save a draft at any step).`}
              </Banner>
              <Button label="Continue to biodata" arrow onPress={() => router.push({ pathname: '/admin/member-biodata', params: { cc: check.countryCode, phone: check.phone } })} testID="add-continue" />
            </View>
          ) : null}
        </Card>
      </View>
      <Section title="Added by the team">
        {added.length ? (
          <View style={{ gap: space.sm }}>
            {added.map((u) => (
              <Card key={u.id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <Text variant="label">
                    {u.profileCode ?? 'No biodata'} · {u.countryCode} {u.phone}
                  </Text>
                  <Row gap={space.xs}>
                    {u.profileStatus ? <Badge label={u.profileStatus} tone="muted" /> : null}
                    <Badge label={u.claimedAt ? 'claimed by member' : 'not yet signed in'} tone={u.claimedAt ? 'success' : 'gold'} />
                  </Row>
                </Row>
                <Text variant="caption">Added {formatDate(u.createdAt, 'en')}</Text>
                <Button label="Open" size="sm" kind="ghost" onPress={() => router.push(`/admin/member/${u.id}`)} style={{ alignSelf: 'flex-start' }} />
              </Card>
            ))}
          </View>
        ) : (
          <Text variant="caption">Nobody added yet.</Text>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  cc: { width: 92 },
});
