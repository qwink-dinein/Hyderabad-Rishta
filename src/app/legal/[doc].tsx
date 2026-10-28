import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ui/feedback';
import { Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { space } from '@/theme/tokens';

/**
 * DRAFT legal copy (English). Must be reviewed by a qualified lawyer (DPDP Act 2023 for India,
 * GDPR/UK GDPR if serving those regions) before launch — tracked in Tasks.md.
 */
const PRIVACY = [
  ['What we collect', 'Your mobile number (for login), the biodata you choose to enter, optional photos, your partner preferences, and activity needed to run the service (requests, shortlists, profile views, notifications).'],
  ['What we do not do', 'We never show your mobile number on your profile. We do not sell personal data. We do not compute compatibility scores from religious practice.'],
  ['Who can see your data', 'Published biodata is visible to logged-in members according to your privacy settings. Photos, income and family details can be limited to people you explicitly consent to. Contact details are shared only after you accept a request AND separately consent.'],
  ['Your choices', 'You can edit or pause your profile, change visibility, block or report members, deactivate your account, or permanently delete it and its data from Settings.'],
  ['Retention', 'Deleted accounts are removed from the live database immediately; backups expire within 30 days. Consent and audit records may be kept as long as legally required.'],
  ['Contact', 'privacy@example.com (placeholder — replace before launch).'],
];
const TERMS = [
  ['Eligibility', 'You must be of legal marriageable age in your country (in India: 18 for women, 21 for men). Profiles created for relatives require their knowledge and consent.'],
  ['Honest information', 'Do not post false, misleading or someone else’s information. Do not request money. We may pause or remove profiles that break these rules.'],
  ['Payments', 'Paid features are one-time purchases with no automatic renewal. Prices shown before payment apply to that order. Development builds only simulate payments.'],
  ['Safety', 'Meet in public places and involve family. Report suspicious behaviour from any profile.'],
  ['Liability', 'We provide a platform for introductions and do not verify identities or guarantee outcomes.'],
];

const HELP = [
  ['How do I create my biodata?', 'Tap “Create your biodata”, verify your mobile number with a one-time code, then follow the guided steps. You can save and continue later.'],
  ['Who can see my phone number?', 'Nobody, unless you choose to offer it to a specific person and they accept. It is never shown on your profile.'],
  ['How do I connect with someone?', 'Open their profile and tap Express Interest. Send an introduction, or offer your number — they decide whether to accept.'],
  ['Can I pause or delete my profile?', 'Yes. Pause it from My profile, or delete your account permanently from Settings.'],
  ['How do I report a problem?', 'Use Report on any profile. Our team reviews every report.'],
  ['Support', 'support@example.com (placeholder — replace before launch).'],
];

export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { t } = useTranslation();
  const isHelp = doc === 'help';
  const isPrivacy = doc !== 'terms' && !isHelp;
  const content = isHelp ? HELP : isPrivacy ? PRIVACY : TERMS;
  return (
    <Screen header={<Header title={isHelp ? t('settings.help') : isPrivacy ? t('legal.privacyTitle') : t('legal.termsTitle')} />}>
      <View style={{ gap: space.lg, paddingVertical: space.lg }}>
        {isHelp ? null : <Banner tone="warning">{t('legal.draftNote')}</Banner>}
        {content.map(([h, b]) => (
          <View key={h} style={{ gap: space.xs }}>
            <Text variant="h3">{h}</Text>
            <Text variant="body">{b}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
