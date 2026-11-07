import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { space } from '@/theme/tokens';

import { LEGAL_UPDATED, PRIVACY, TERMS } from '@/content/legal';

const HELP = [
  ['How do I create my biodata?', 'Tap “Create your biodata”, verify your mobile number with a one-time code, then follow the guided steps. You can save and continue later.'],
  ['Who can see my phone number?', 'Nobody, unless you choose to offer it to a specific person and they accept. It is never shown on your profile.'],
  ['How do I connect with someone?', 'Open their profile and tap Express Interest. Send an introduction, or offer your number — they decide whether to accept.'],
  ['Can I pause or delete my profile?', 'Yes. Pause it from My profile, or delete your account permanently from Settings.'],
  ['How do I report a problem?', 'Use Report on any profile. Our team reviews every report.'],
  ['Support', 'Email us at mukarramjahmm@gmail.com — we reply as soon as we can.'],
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
        {isHelp ? null : <Text variant="caption">{t('legal.updated', { date: LEGAL_UPDATED })}</Text>}
        {content.map(([h, b]) => (
          <View key={h} style={{ gap: space.xs }}>
            <Text variant="h3">{h}</Text>
            <Text variant="body" selectable>
              {b}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}
