import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { uid } from '@/domain/format';
import type { Photo } from '@/domain/types';
import { colors, radius, space } from '@/theme/tokens';
import { Icon, StarMotif } from './ui/Icon';
import { Text } from './ui/Text';

const MAX_PHOTOS = 3;
const MAX_BYTES = 1.5 * 1024 * 1024;

/**
 * Optional photos (0–3) with add / preview / replace / remove, size validation and progress.
 * Demo backend stores a compressed data URI locally; production uploads to a private
 * Supabase Storage bucket and serves signed URLs (see Architecture.md §Storage).
 */
export function PhotoPicker({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const pick = async (replaceId?: string) => {
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
    // Simulated upload progress (labelled as such in demo mode); real uploads report actual progress.
    for (const p of [25, 60, 90]) {
      setProgress(p);
      await new Promise((r) => setTimeout(r, 90));
    }
    setProgress(null);
    const uri = a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
    if (replaceId) onChange(photos.map((p) => (p.id === replaceId ? { id: uid('ph_'), uri } : p)));
    else onChange([...photos, { id: uid('ph_'), uri }].slice(0, MAX_PHOTOS));
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        {photos.map((p, i) => (
          <View key={p.id} style={styles.slot}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={`${t('f.photos')} ${i + 1}`} />
            <View style={styles.actions}>
              <Pressable onPress={() => pick(p.id)} accessibilityRole="button" accessibilityLabel={`${t('f.replace')} ${i + 1}`} style={styles.actionBtn}>
                <Icon name="camera" size={16} color={colors.white} />
              </Pressable>
              <Pressable onPress={() => onChange(photos.filter((x) => x.id !== p.id))} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${i + 1}`} style={styles.actionBtn}>
                <Icon name="close" size={16} color={colors.white} />
              </Pressable>
            </View>
          </View>
        ))}
        {photos.length < MAX_PHOTOS ? (
          <Pressable onPress={() => pick()} accessibilityRole="button" accessibilityLabel={t('f.addPhoto')} style={[styles.slot, styles.empty]} disabled={progress !== null}>
            <View style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <StarMotif size={70} opacity={0.25} />
              </View>
            </View>
            <Icon name="plus" size={24} />
            <Text variant="caption" color={colors.emerald} center>
              {progress !== null ? t('f.uploading', { p: progress }) : t('f.addPhoto')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text variant="caption">
        {t('f.photosHint')} · {photos.length}/{MAX_PHOTOS}
      </Text>
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  slot: { width: 100, height: 125, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.sage },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.white },
  actions: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(18,61,50,0.75)', alignItems: 'center', justifyContent: 'center' },
});
