import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from '../ui/Text';

/** Profile ID chip used across the admin console; tapping it opens that member's page. */
export function CodeLink({ code, userId }: { code?: string; userId?: string }) {
  const label = code ?? 'No profile';
  if (!userId) return <Text variant="caption">{label}</Text>;
  return (
    <Pressable
      onPress={() => router.push(`/admin/member/${userId}`)}
      accessibilityRole="link"
      accessibilityLabel={`Open member ${label}`}
      hitSlop={6}
      style={{ backgroundColor: colors.sage, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' }}
      testID={`code-${label}`}
    >
      <Text variant="label" color={colors.emerald} style={{ fontSize: 12.5 }}>
        {label}
      </Text>
    </Pressable>
  );
}
