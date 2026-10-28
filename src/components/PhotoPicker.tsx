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

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.headRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('f.photosAddTitle')}</Text>
          <Text variant="caption">{t('f.photosAddSub')}</Text>
        </View>
        <View style={styles.counter} accessibilityLabel={`${photos.length} / ${MAX_PHOTOS}`}>
          <Text variant="label" color={colors.emerald}>
            {photos.length}/{MAX_PHOTOS}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        {Array.from({ length: MAX_PHOTOS }, (_, i) => {
          const p = photos[i];
          return (
            <View key={i} style={{ flex: 1, gap: 4, minWidth: 90 }}>
              {p ? (
                <View style={[styles.slot, styles.filled]}>
                  <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={slotLabel(i)} />
                  <View style={styles.actions}>
                    <Pressable onPress={() => pick(i, p.id)} accessibilityRole="button" accessibilityLabel={`${t('f.replace')}: ${slotLabel(i)}`} style={styles.actionBtn}>
                      <Icon name="camera" size={16} color={colors.white} />
                    </Pressable>
                    <Pressable onPress={() => onChange(photos.filter((x) => x.id !== p.id))} accessibilityRole="button" accessibilityLabel={`${t('common.remove')}: ${slotLabel(i)}`} style={styles.actionBtn}>
                      <Icon name="close" size={16} color={colors.white} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => pick(i)}
                  disabled={busySlot !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('f.addPhoto')}: ${slotLabel(i)}`}
                  style={[styles.slot, styles.empty]}
                  testID={`photo-slot-${i + 1}`}
                >
                  <View style={styles.plus}>
                    <Icon name={i === 0 ? 'user' : 'plus'} size={22} />
                  </View>
                  <Text variant="caption" color={colors.emerald} center>
                    {busySlot === i ? t('f.uploading', { p: progress }) : t('f.tapToAdd')}
                  </Text>
                </Pressable>
              )}
              <Text variant="caption" center color={i === 0 ? colors.goldDeep : colors.muted}>
                {slotLabel(i)}
              </Text>
            </View>
          );
        })}
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
  row: { flexDirection: 'row', gap: space.sm },
  slot: { aspectRatio: 4 / 5, width: '100%', maxWidth: 160, alignSelf: 'center', borderRadius: radius.md, overflow: 'hidden' },
  filled: { backgroundColor: colors.sage },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.white },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  actions: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(18,61,50,0.75)', alignItems: 'center', justifyContent: 'center' },
});
