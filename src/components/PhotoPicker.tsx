import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { uid } from '@/domain/format';
import type { Photo } from '@/domain/types';
import { colors, radius, space } from '@/theme/tokens';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

const MAX_PHOTOS = 3;
const MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * Optional photos with THREE always-visible, labelled slots (Main photo, Photo 2, Photo 3) so
 * people immediately understand they can add up to three. Add / preview / replace / remove,
 * size validation and progress. Demo stores a compressed data URI; production uploads to private
 * Supabase Storage with signed URLs (Architecture.md).
 */
export function PhotoPicker({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  const pick = async (slot: number, replaceId?: string) => {
    setError(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.5, base64: Platform.OS === 'web' });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const size = a.fileSize ?? (a.base64 ? a.base64.length * 0.75 : 0);
    if (size > MAX_BYTES) return setError(t('v.photoTooLarge'));
    setBusySlot(slot);
    for (const p of [25, 60, 90]) {
      setProgress(p);
      await new Promise((r) => setTimeout(r, 90));
    }
    setBusySlot(null);
    const uri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    if (replaceId) onChange(photos.map((p) => (p.id === replaceId ? { id: uid('ph_'), uri } : p)));
    else onChange([...photos, { id: uid('ph_'), uri }].slice(0, MAX_PHOTOS));
  };

  const slotLabel = (i: number) => (i === 0 ? t('f.photoMain') : t('f.photoN', { n: i + 1 }));
  // Layout: one large main slot (4:5) and two smaller slots stacked beside it, same total height.
  const [w, setW] = useState(0);
  const GAP = space.sm;
  const mainW = Math.round((w - GAP) * 0.6);
  const sideW = w - GAP - mainW;
  const mainH = Math.round(mainW * 1.25);
  const sideH = Math.round((mainH - GAP) / 2);

  const slot = (i: number, width: number, height: number) => {
    const p = photos[i];
    const main = i === 0;
    if (p)
      return (
        <View style={[styles.slot, { width, height }, styles.filled]}>
          <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={slotLabel(i)} />
          <View style={styles.labelPill}>
            <Text variant="caption" color={colors.white} style={{ fontSize: 11.5 }}>
              {slotLabel(i)}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => pick(i, p.id)} accessibilityRole="button" accessibilityLabel={`${t('f.replace')}: ${slotLabel(i)}`} style={styles.actionBtn} hitSlop={4}>
              <Icon name="camera" size={16} color={colors.white} />
            </Pressable>
            <Pressable onPress={() => onChange(photos.filter((x) => x.id !== p.id))} accessibilityRole="button" accessibilityLabel={`${t('common.remove')}: ${slotLabel(i)}`} style={styles.actionBtn} hitSlop={4}>
              <Icon name="close" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>
      );
    return (
      <Pressable
        onPress={() => pick(i)}
        disabled={busySlot !== null}
        accessibilityRole="button"
        accessibilityLabel={`${t('f.addPhoto')}: ${slotLabel(i)}`}
        style={({ pressed }) => [styles.slot, { width, height }, styles.empty, main && styles.emptyMain, pressed && { opacity: 0.85 }]}
        testID={`photo-slot-${i + 1}`}
      >
        <View style={[styles.plus, main && styles.plusMain]}>
          <Icon name={main ? 'camera' : 'plus'} size={main ? 26 : 20} color={colors.emerald} />
        </View>
        <Text variant={main ? 'bodyStrong' : 'label'} color={colors.emerald} center>
          {busySlot === i ? t('f.uploading', { p: progress }) : main ? t('f.addPhoto') : t('f.tapToAdd')}
        </Text>
        <Text variant="caption" color={main ? colors.goldDeep : colors.muted} center>
          {slotLabel(i)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{t('f.photosAddTitle')}</Text>
          <Text variant="caption">{t('f.photosAddSub')}</Text>
        </View>
        <View style={styles.counter} accessibilityLabel={`${photos.length} / ${MAX_PHOTOS}`}>
          <Text variant="label" color={colors.emerald}>
            {photos.length}/{MAX_PHOTOS}
          </Text>
        </View>
      </View>
      <View style={[styles.row, { gap: GAP, maxWidth: 520 }]} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w ? (
          <>
            {slot(0, mainW, mainH)}
            <View style={{ gap: GAP }}>
              {slot(1, sideW, sideH)}
              {slot(2, sideW, sideH)}
            </View>
          </>
        ) : null}
      </View>
      <View style={styles.reassure}>
        <Icon name="lock" size={16} color={colors.goldMuted} />
        <Text variant="caption" style={{ flex: 1 }}>
          {t('f.photosReassure')}
        </Text>
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  counter: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.sage },
  row: { flexDirection: 'row', width: '100%' },
  slot: { borderRadius: radius.md, overflow: 'hidden' },
  filled: { backgroundColor: colors.sage },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.white },
  emptyMain: { backgroundColor: '#FFFDF8', gap: space.xs },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  plusMain: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.goldSoft },
  labelPill: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(11,48,40,0.65)' },
  actions: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(11,48,40,0.75)', alignItems: 'center', justifyContent: 'center' },
  reassure: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft },
});
