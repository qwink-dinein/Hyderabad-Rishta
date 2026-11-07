import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { PublicProfile } from '@/domain/types';
import { colors, space } from '@/theme/tokens';
import { ProfileCard, ProfileCardSkeleton } from './ProfileCard';
import { Row } from './ui/layout';
import { Text } from './ui/Text';

const CARD = 230;

/**
 * A titled horizontal carousel of profile cards (Featured, Recommended, Recently Published, New since your
 * last visit) shared by Home and Discover. Every card has the same size and snaps into place; boosted cards
 * carry the gold edge and badge from ProfileCard. Hidden when there is nothing to show (and not loading).
 */
export const ProfileRail = memo(function ProfileRail({
  title,
  note,
  action,
  onAction,
  items,
  loading,
  shortlisted,
  onToggleShortlist,
  onOpen,
  inset = space.lg,
  trailing,
  testID,
}: {
  title: string;
  note?: string;
  action?: string;
  onAction?: () => void;
  items: PublicProfile[];
  loading?: boolean;
  shortlisted: Set<string>;
  onToggleShortlist: (id: string) => void;
  onOpen: (id: string) => void;
  /** Horizontal padding, so the first card lines up with the screen's column. */
  inset?: number;
  /** A last card after the profiles (same width), e.g. the Boost tile on Featured. */
  trailing?: (width: number) => ReactNode;
  testID: string;
}) {
  if (!loading && !items.length) return null;
  return (
    <View style={{ gap: space.sm }} testID={testID}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: inset }} gap={space.sm}>
        <Text variant="h2" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {title}
        </Text>
        {action && onAction ? (
          <Text
            variant="label"
            color={colors.emerald}
            onPress={onAction}
            accessibilityRole="link"
            accessibilityLabel={`${action}: ${title}`}
            style={{ paddingVertical: space.sm }}
            testID={`${testID}-all`}
          >
            {action}
          </Text>
        ) : null}
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD + space.md}
        snapToAlignment="start"
        contentContainerStyle={[styles.rail, { paddingHorizontal: inset }]}
      >
        {loading && !items.length
          ? [0, 1].map((i) => (
              <View key={i} style={{ width: CARD }}>
                <ProfileCardSkeleton />
              </View>
            ))
          : items.map((p) => (
              <View key={p.id} testID={`${testID}-card-${p.id}`}>
                <ProfileCard profile={p} variant="featured" shortlisted={shortlisted.has(p.id)} onToggleShortlist={onToggleShortlist} onOpen={onOpen} />
              </View>
            ))}
        {!loading || items.length ? trailing?.(CARD) : null}
      </ScrollView>
      {note ? (
        <Text variant="caption" style={{ paddingHorizontal: inset }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { gap: space.md, paddingBottom: space.sm, alignItems: 'stretch' },
});
