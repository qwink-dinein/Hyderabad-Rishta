import { useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useUiT } from '@/i18n/uiLang';
import { uid } from '@/domain/format';
import type { Photo } from '@/domain/types';
import { AppError } from '@/services/backend';
import { uploadProblem } from '@/domain/security';
import { preparePhoto, type PhotoCrop } from '@/services/photos';
import { colors, radius, space } from '@/theme/tokens';
import { PhotoAdjust, type PickedPhoto } from './PhotoAdjust';
import { useToast } from './ui/feedback';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

const MAX_PHOTOS = 3;

/**
 * Optional photos with THREE always-visible, labelled slots (Main photo, Photo 2, Photo 3) so
 * people immediately understand they can add up to three. Add / preview / replace / remove,
 * size validation and progress. Originals up to 5 MB are accepted and shrunk on the phone
 * (services/photos.ts). Demo stores the compressed data URI; production uploads to private
 * Supabase Storage with signed URLs (Architecture.md).
 */
export function PhotoPicker({ photos, onChange }: { photos: Photo[]; onChange: (p: Photo[]) => void }) {
  const t = useUiT();
  const [error, setError] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [denied, setDenied] = useState<null | 'ask' | 'settings'>(null);

  // Where the next photo goes, while the "Add a photo" sheet / adjust screen are open.
  const [target, setTarget] = useState<{ slot: number; replaceId?: string } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<PickedPhoto | null>(null);
  const toast = useToast((s) => s.show);

  // Tapping a slot opens the "Add a photo" sheet (gallery or camera, with quick tips).
  const pick = (slot: number, replaceId?: string) => {
    setError(null);
    setTarget({ slot, replaceId });
    setSheet(true);
  };

  const choose = async (from: 'gallery' | 'camera') => {
    setSheet(false);
    if (Platform.OS !== 'web') {
      const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        // Say why we asked and how to allow it; never fail silently. Photos stay optional either way.
        if (from === 'camera') setError(t('photo.cameraDenied'));
        else setDenied(perm.canAskAgain ? 'ask' : 'settings');
        return;
      }
      setDenied(null);
    }
    // No built-in crop screen (its tiny ✓ was easy to miss): our own adjust screen comes next.
    // quality 1: keep the original so the 5 MB limit applies to what the member picked; we compress after.
    const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: false, quality: 1 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    // Too big / not a photo: say so now, before any adjusting.
    const problem = uploadProblem(a);
    if (problem) return setError(t(problem));
    setEditing({ uri: a.uri, width: a.width, height: a.height, fileSize: a.fileSize, mimeType: a.mimeType });
  };

  const use = async (img: PickedPhoto, crop?: PhotoCrop) => {
    if (!target) return;
    const { slot, replaceId } = target;
    setBusySlot(slot);
    setProgress(25);
    let uri: string;
    try {
      uri = await preparePhoto(img as ImagePicker.ImagePickerAsset, crop);
    } catch (e) {
      setBusySlot(null);
      setEditing(null);
      return setError(t(e instanceof AppError && e.message.startsWith('v.') ? e.message : 'v.photoInvalid'));
    }
    setProgress(90);
    setBusySlot(null);
    setEditing(null);
    if (replaceId) onChange(photos.map((p) => (p.id === replaceId ? { id: uid('ph_'), uri } : p)));
    else onChange([...photos, { id: uid('ph_'), uri }].slice(0, MAX_PHOTOS));
    toast(t('photo.added'));
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
      {denied ? (
        <View style={styles.denied} accessibilityRole="alert" testID="photo-permission-denied">
          <Icon name="lock" size={18} color={colors.goldDeep} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label">{t('perm.photosTitle')}</Text>
            <Text variant="caption">{t(denied === 'settings' ? 'perm.photosSettings' : 'perm.photosAsk')}</Text>
            <Pressable
              onPress={() => (denied === 'settings' ? Linking.openSettings().catch(() => undefined) : pick(photos.length))}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Text variant="label" color={colors.emerald}>
                {denied === 'settings' ? t('push.openSettings') : t('common.retry')}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* "Add a photo": gallery or camera, with four quick tips. */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.scrim} onPress={() => setSheet(false)} accessibilityLabel={t('common.close')} />
        <View style={styles.sheet} testID="photo-source-sheet">
          <View style={styles.grab} />
          <Text variant="h2">{t('photo.addTitle')}</Text>
          <View style={styles.tips}>
            {(['tip1', 'tip2', 'tip3'] as const).map((k) => (
              <View key={k} style={styles.tip}>
                <Icon name="check" size={14} color={colors.success} />
                <Text variant="caption" color={colors.charcoal}>{t(`photo.${k}`)}</Text>
              </View>
            ))}
            <View style={styles.tip}>
              <Icon name="close" size={14} color={colors.danger} />
              <Text variant="caption" color={colors.charcoal}>{t('photo.tip4')}</Text>
            </View>
          </View>
          <Pressable onPress={() => choose('gallery')} accessibilityRole="button" style={styles.option} testID="photo-from-gallery">
            <View style={styles.optIcon}><Icon name="image" size={18} color={colors.emerald} /></View>
            <Text variant="bodyStrong">{t('photo.gallery')}</Text>
          </Pressable>
          <Pressable onPress={() => choose('camera')} accessibilityRole="button" style={styles.option} testID="photo-from-camera">
            <View style={styles.optIcon}><Icon name="camera" size={18} color={colors.emerald} /></View>
            <Text variant="bodyStrong">{t('photo.camera')}</Text>
          </Pressable>
          <Text variant="caption" center>{t('photo.note')}</Text>
        </View>
      </Modal>

      {editing ? (
        <PhotoAdjust
          photo={editing}
          busy={busySlot !== null}
          onUse={use}
          onCancel={() => setEditing(null)}
          onChooseAnother={() => {
            setEditing(null);
            setSheet(true);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.beige },
  tips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.xs },
  tip: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  option: { minHeight: 60, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  optIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  denied: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  counter: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.sage },
  row: { flexDirection: 'row', width: '100%' },
  slot: { borderRadius: radius.md, overflow: 'hidden' },
  filled: { backgroundColor: colors.sage },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.white },
  emptyMain: { backgroundColor: colors.white, gap: space.xs },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  plusMain: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.goldSoft },
  labelPill: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(42,11,19,0.65)' },
  actions: { position: 'absolute', bottom: 6, left: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(42,11,19,0.75)', alignItems: 'center', justifyContent: 'center' },
  reassure: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft },
});
