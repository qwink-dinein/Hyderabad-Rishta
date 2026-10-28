import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Card, Divider, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { COUNTRY_CODES } from '@/domain/options';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

const ccOptions = COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }));

/**
 * Team & security.
 * - Master: add/remove sub-admins, transfer master, recovery codes, backup phone, cancel a recovery.
 * - Sub-admins: read-only view of the team and recovery status.
 */
export default function Team() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { user, setUser } = useSession();
  const isMaster = user?.role === 'master';
  const { data: team, isLoading } = useQuery({ queryKey: qk.admin('team'), queryFn: () => backend.masterListAdmins() });
  const { data: sec } = useQuery({ queryKey: qk.admin('security'), queryFn: () => backend.masterSecurityStatus() });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      refresh();
      if (msg) toast(msg);
      return true;
    } catch (e) {
      toast(errMsg(e), 'danger');
      return false;
    }
  };

  // add sub-admin
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  // step-up OTP (to the master's own phone) for sensitive actions
  const [otpFor, setOtpFor] = useState<null | 'codes' | { transferTo: string }>(null);
  const [otp, setOtp] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  // backup phone
  const [bcc, setBcc] = useState('+91');
  const [bphone, setBphone] = useState('');
  const [botpSent, setBotpSent] = useState(false);
  const [botp, setBotp] = useState('');

  const startStepUp = async (what: 'codes' | { transferTo: string }) => {
    if (!user) return;
    if (await run(() => backend.requestOtp(user.countryCode, user.phone), 'Verification code sent to your phone (demo: 123456).')) {
      setOtp('');
      setOtpFor(what);
    }
  };
  const confirmStepUp = async () => {
    if (!otpFor) return;
    if (otpFor === 'codes') {
      try {
        setCodes(await backend.masterGenerateRecoveryCodes(otp));
        setOtpFor(null);
        refresh();
      } catch (e) {
        toast(errMsg(e), 'danger');
      }
    } else {
      const ok = await run(() => backend.masterTransfer(otpFor.transferTo, otp), 'Master role transferred. You are now a sub-admin.');
      if (ok) {
        setOtpFor(null);
        const s = await backend.getSession();
        setUser(s);
        router.replace('/admin');
      }
    }
  };

  const copyCodes = async () => {
    if (!codes) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') await navigator.clipboard.writeText(codes.join('\n'));
      toast('Codes copied. Store them somewhere safe and offline.');
    } catch {
      toast('Select the codes and copy them manually.', 'info');
    }
  };

  const subAdmins = team?.filter((m) => m.role === 'admin') ?? [];

  return (
    <Screen header={<Header title="Team & security" />}>
      {!isMaster ? (
        <View style={{ marginTop: space.lg }}>
          <Banner icon="lock">You are a sub-admin: you can moderate everything, but only the master admin can change the team or recovery settings.</Banner>
        </View>
      ) : null}

      {sec?.pendingRecovery ? (
        <View style={{ marginTop: space.lg }}>
          <Banner tone="danger" icon="shield">
            <Text variant="bodyStrong" color={colors.danger}>
              Recovery requested for {sec.pendingRecovery.phoneMasked}
            </Text>
            <Text variant="caption" color={colors.danger}>
              Started {formatDate(sec.pendingRecovery.startedAt)}. The master role moves to that phone on {formatDate(sec.pendingRecovery.completesAt)}. If this wasn't you, cancel it now and generate new recovery codes.
            </Text>
            {isMaster ? (
              <Button label="Cancel this recovery" kind="danger" size="sm" style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => run(() => backend.masterCancelRecovery(), 'Recovery cancelled.')} testID="cancel-recovery" />
            ) : null}
          </Banner>
        </View>
      ) : null}

      <Section title="Admin team">
        <Card style={{ gap: space.sm }}>
          {isLoading ? (
            <Loading />
          ) : (
            team?.map((m) => (
              <Row key={m.id} style={{ justifyContent: 'space-between' }} wrap>
                <View>
                  <Text variant="label">
                    {m.phoneMasked}
                    {m.id === user?.id ? ' (you)' : ''}
                  </Text>
                  <Text variant="caption">Since {formatDate(m.createdAt)}</Text>
                </View>
                <Row gap={space.sm}>
                  <Badge label={m.role === 'master' ? 'master' : 'sub-admin'} tone={m.role === 'master' ? 'gold' : 'emerald'} />
                  {isMaster && m.role === 'admin' ? (
                    <Button
                      label="Remove"
                      size="sm"
                      kind="ghost"
                      onPress={async () => {
                        if (await confirm({ title: 'Remove this sub-admin?', body: 'They become a regular member immediately and lose all admin access.', confirmLabel: 'Remove', danger: true }))
                          run(() => backend.masterRemoveSubAdmin(m.id), 'Sub-admin removed.');
                      }}
                    />
                  ) : null}
                </Row>
              </Row>
            ))
          )}
          {isMaster ? (
            <>
              <Divider />
              <Text variant="h3">Add a sub-admin</Text>
              <Text variant="caption">They log in with this mobile number. Sub-admins can moderate everything but cannot manage the team, recovery or Trash restores. Max 10.</Text>
              <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 130 }}>
                  <Select label="Country code" options={ccOptions} value={cc} onChange={setCc} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} keyboardType="phone-pad" placeholder="Mobile number" accessibilityLabel="Sub-admin mobile number" testID="subadmin-phone" />
                </View>
              </Row>
              <Button
                label="Add sub-admin"
                size="sm"
                style={{ alignSelf: 'flex-start' }}
                disabled={phone.length < 6}
                testID="add-subadmin"
                onPress={async () => {
                  if (await run(() => backend.masterAddSubAdmin(cc, phone), 'Sub-admin added.')) setPhone('');
                }}
              />
            </>
          ) : null}
        </Card>
      </Section>

      {isMaster ? (
        <>
          <Section title="Lost-phone recovery">
            <Card style={{ gap: space.md }}>
              <Text variant="body">
                If you lose this phone, open the app on any phone, tap “Master admin: lost your phone?” on the login screen, and enter one recovery code:
              </Text>
              <Text variant="caption">• On your verified backup phone → you are master again immediately.{'\n'}• On any other phone → a 72-hour safety delay starts, and you can cancel it from here if it wasn't you.</Text>
              <Divider />
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <View>
                  <Text variant="h3">Recovery codes</Text>
                  <Text variant="caption">
                    {sec?.codesRemaining ? `${sec.codesRemaining} unused · generated ${formatDate(sec.codesGeneratedAt)}` : 'Not set up'}
                  </Text>
                </View>
                <Badge label={sec?.codesRemaining ? 'active' : 'missing'} tone={sec?.codesRemaining ? 'success' : 'danger'} />
              </Row>
              {codes ? (
                <View style={{ gap: space.sm }}>
                  <Banner tone="warning" icon="lock">Shown only once. Write them down or store them in a password manager. Each code works once. Generating new codes cancels these.</Banner>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }} testID="recovery-codes">
                    {codes.map((c) => (
                      <Text key={c} variant="bodyStrong" selectable style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), width: 120 }}>
                        {c}
                      </Text>
                    ))}
                  </View>
                  <Row gap={space.sm}>
                    <Button label="Copy codes" size="sm" kind="secondary" onPress={copyCodes} />
                    <Button label="I've saved them" size="sm" onPress={() => setCodes(null)} />
                  </Row>
                </View>
              ) : (
                <Button
                  label={sec?.codesRemaining ? 'Generate new codes' : 'Generate recovery codes'}
                  size="sm"
                  style={{ alignSelf: 'flex-start' }}
                  onPress={() => startStepUp('codes')}
                  testID="generate-codes"
                />
              )}
              <Divider />
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <View>
                  <Text variant="h3">Backup phone</Text>
                  <Text variant="caption">{sec?.backupPhoneMasked ?? 'Not set'}</Text>
                </View>
                <Badge label={sec?.backupPhoneMasked ? 'verified' : 'missing'} tone={sec?.backupPhoneMasked ? 'success' : 'danger'} />
              </Row>
              <Text variant="caption">Use a number you control that is NOT your login phone — e.g. a family member's or a second SIM.</Text>
              <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 130 }}>
                  <Select label="Country code" options={ccOptions} value={bcc} onChange={setBcc} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField value={bphone} onChangeText={(v) => setBphone(v.replace(/\D/g, ''))} keyboardType="phone-pad" placeholder="Backup mobile number" accessibilityLabel="Backup mobile number" testID="backup-phone" />
                </View>
              </Row>
              {!botpSent ? (
                <Button
                  label="Send code to backup phone"
                  size="sm"
                  kind="secondary"
                  style={{ alignSelf: 'flex-start' }}
                  disabled={bphone.length < 6}
                  onPress={async () => {
                    if (await run(() => backend.requestOtp(bcc, bphone), 'Code sent to the backup phone (demo: 123456).')) setBotpSent(true);
                  }}
                  testID="backup-send"
                />
              ) : (
                <Row gap={space.sm}>
                  <View style={{ flex: 1 }}>
                    <TextField value={botp} onChangeText={(v) => setBotp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit code" accessibilityLabel="Backup phone code" testID="backup-otp" />
                  </View>
                  <Button
                    label="Verify"
                    size="sm"
                    onPress={async () => {
                      if (await run(() => backend.masterSetBackupPhone(bcc, bphone, botp), 'Backup phone verified.')) {
                        setBotpSent(false);
                        setBotp('');
                        setBphone('');
                      }
                    }}
                    testID="backup-verify"
                  />
                </Row>
              )}
            </Card>
          </Section>

          <Section title="Transfer master role">
            <Card style={{ gap: space.sm }}>
              <Text variant="caption">Hand the master role to an active sub-admin (e.g. if you are stepping down). You become a sub-admin. Requires a code sent to your phone.</Text>
              {subAdmins.length ? (
                subAdmins.map((m) => (
                  <Row key={m.id} style={{ justifyContent: 'space-between' }}>
                    <Text variant="label">{m.phoneMasked}</Text>
                    <Button
                      label="Make master"
                      size="sm"
                      kind="secondary"
                      onPress={async () => {
                        if (await confirm({ title: 'Transfer the master role?', body: `${m.phoneMasked} becomes the only master. You become a sub-admin. Your recovery codes and backup phone are cleared so the new master sets their own.`, confirmLabel: 'Continue', danger: true }))
                          startStepUp({ transferTo: m.id });
                      }}
                    />
                  </Row>
                ))
              ) : (
                <Text variant="caption">Add a sub-admin first.</Text>
              )}
            </Card>
          </Section>

          {otpFor ? (
            <Section title="Confirm it's you">
              <Card style={{ gap: space.sm }}>
                <Field label={`Code sent to ${user?.countryCode} ••••${user?.phone.slice(-4)}`}>
                  <TextField value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit code" accessibilityLabel="Verification code" testID="stepup-otp" />
                </Field>
                <Row gap={space.sm}>
                  <Button label="Cancel" size="sm" kind="secondary" onPress={() => setOtpFor(null)} />
                  <Button label="Confirm" size="sm" onPress={confirmStepUp} disabled={otp.length !== 6} testID="stepup-confirm" />
                </Row>
              </Card>
            </Section>
          ) : null}
        </>
      ) : sec ? (
        <Section title="Recovery status">
          <Card>
            <Text variant="caption">
              Recovery codes: {sec.codesRemaining ? `${sec.codesRemaining} unused` : 'not set up'} · Backup phone: {sec.backupPhoneMasked ?? 'not set'}
            </Text>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
