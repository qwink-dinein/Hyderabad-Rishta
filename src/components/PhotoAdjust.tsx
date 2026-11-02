import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiT } from '@/i18n/uiLang';
import type { PhotoCrop } from '@/services/photos';
import { rotatePhoto } from '@/services/photos';
import { colors, radius, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

export type PickedPhoto = { uri: string; width: number; height: number; fileSize?: number; mimeType?: string };
const RATIO = 5 / 4; // frame height / width (profile photos are 4:5)
const MAX_ZOOM = 4;

/** The part of the picture inside the frame, in the picture's own pixels. Pure (unit-tested). */
export function cropFor(img: { width: number; height: number }, frame: { width: number; height: number }, view: { zoom: number; x: number; y: number }): PhotoCrop {
  const s = Math.max(frame.width / img.width, frame.height / img.height) * view.zoom;
  const dw = img.width * s;
  const dh = img.height * s;
  const width = Math.min(img.width, frame.width / s);
  const height = Math.min(img.height, frame.height / s);
  const originX = Math.min(img.width - width, Math.max(0, ((dw - frame.width) / 2 - view.x) / s));
  const originY = Math.min(img.height - height, Math.max(0, ((dh - frame.height) / 2 - view.y) / s));
  return { originX, originY, width, height };
}

/** Keeps the picture covering the whole frame (no empty edges) at the given zoom. */
function clampView(img: { width: number; height: number }, frame: { width: number; height: number }, v: { zoom: number; x: number; y: number }) {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, v.zoom));
  const s = Math.max(frame.width / img.width, frame.height / img.height) * zoom;
  const mx = Math.max(0, (img.width * s - frame.width) / 2);
  const my = Math.max(0, (img.height * s - frame.height) / 2);
  return { zoom, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
}

const dist = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
};

type Live = { view: { zoom: number; x: number; y: number }; img: { width: number; height: number }; frame: { width: number; height: number }; whole: boolean };
/** Pinch (two fingers) and drag (one finger) inside the frame; reads the latest state from `live`. */
function makePan(live: { current: Live }, start: { current: { view: Live['view']; d: number } }, setView: (v: Live['view']) => void) {
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !live.current.whole,
    onMoveShouldSetPanResponder: () => !live.current.whole,
    onPanResponderGrant: (e) => {
      start.current = { view: live.current.view, d: dist(e) };
    },
    onPanResponderMove: (e, g) => {
      const d = dist(e);
      if (d && !start.current.d) start.current = { view: live.current.view, d }; // second finger landed
      const zoom = d && start.current.d ? start.current.view.zoom * (d / start.current.d) : start.current.view.zoom;
      setView(clampView(live.current.img, live.current.frame, { zoom, x: start.current.view.x + g.dx, y: start.current.view.y + g.dy }));
    },
  });
}

/**
 * Our own "adjust your photo" screen (approved design 2026-11-02), replacing the phone's built-in crop
 * screen whose only way to finish was a tiny ✓ in a corner. Pinch / drag inside a 4:5 frame, Rotate,
 * "Fit whole photo", and one big gold "Use this photo" button. ✕ or Back asks before discarding.
 */
export function PhotoAdjust({ photo, onUse, onCancel, onChooseAnother, busy }: {
  photo: PickedPhoto;
  onUse: (photo: PickedPhoto, crop?: PhotoCrop) => void;
  onCancel: () => void;
  onChooseAnother: () => void;
  busy?: boolean;
}) {
  const t = useUiT();
  const insets = useSafeAreaInsets();
  const [img, setImg] = useState(photo);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [whole, setWhole] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [asking, setAsking] = useState(false);
  const start = useRef({ view, d: 0 });
  const frame = useMemo(() => {
    const width = Math.min(box.width - space.xl * 2, (box.height - space.lg * 2) / RATIO);
    return { width: Math.max(0, width), height: Math.max(0, width * RATIO) };
  }, [box]);
  const base = frame.width ? Math.max(frame.width / img.width, frame.height / img.height) : 0;
  const scale = whole && frame.width ? Math.min(frame.width / img.width, frame.height / img.height) : base * view.zoom;

  // Gesture handlers are created once and read the latest values from this ref (kept in sync below).
  const live = useRef({ view, img, frame, whole });
  useEffect(() => {
    live.current = { view, img, frame, whole };
  }, [view, img, frame, whole]);
  // The refs are only read inside the gesture callbacks, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => makePan(live, start, setView));

  const zoomBy = (f: number) => setView((v) => clampView(img, frame, { ...v, zoom: v.zoom * f }));
  const rotate = async () => {
    setRotating(true);
    try {
      const r = await rotatePhoto(img);
      setImg({ ...img, ...r });
      setView({ zoom: 1, x: 0, y: 0 });
    } finally {
      setRotating(false);
    }
  };
  // ✕ / Back: ask first (inside this screen — the app's own dialogs sit behind it).
  const close = () => setAsking(true);

  return (
    <Modal visible animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, space.lg) }]} testID="photo-adjust">
        <View style={styles.bar}>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={t('photo.discard')} hitSlop={10} style={styles.x} testID="photo-adjust-close">
            <Icon name="close" size={24} color={colors.white} />
          </Pressable>
          <Text variant="h3" color={colors.white} style={{ flex: 1, textAlign: 'center' }}>
            {t('photo.adjust')}
          </Text>
          <View style={styles.x} />
        </View>

        <View style={styles.stage} onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} {...pan.panHandlers}>
          {frame.width ? (
            <View style={[styles.frame, { width: frame.width, height: frame.height }]}>
              <Image
                source={{ uri: img.uri }}
                style={{
                  position: 'absolute',
                  width: img.width * scale,
                  height: img.height * scale,
                  left: (frame.width - img.width * scale) / 2 + (whole ? 0 : view.x),
                  top: (frame.height - img.height * scale) / 2 + (whole ? 0 : view.y),
                }}
                contentFit="fill"
                accessibilityIgnoresInvertColors
              />
              <View style={styles.grid} pointerEvents="none">
                <View style={[styles.gl, { left: '33.3%' }]} />
                <View style={[styles.gl, { left: '66.6%' }]} />
                <View style={[styles.gh, { top: '33.3%' }]} />
                <View style={[styles.gh, { top: '66.6%' }]} />
              </View>
            </View>
          ) : null}
        </View>

        <Text variant="body" color="#D9CCD0" center style={{ paddingHorizontal: space.xl, marginTop: space.sm }}>
          {Platform.OS === 'web' ? t('photo.helpWeb') : t('photo.help')}
        </Text>
        <View style={styles.tools}>
          {Platform.OS === 'web' && !whole ? (
            <>
              <Pressable onPress={() => zoomBy(1 / 1.2)} accessibilityRole="button" accessibilityLabel={t('photo.zoomOut')} style={styles.tool} testID="photo-zoom-out">
                <Text variant="label" color="#F1E6EA">−</Text>
              </Pressable>
              <Pressable onPress={() => zoomBy(1.2)} accessibilityRole="button" accessibilityLabel={t('photo.zoomIn')} style={styles.tool} testID="photo-zoom-in">
                <Text variant="label" color="#F1E6EA">+</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable onPress={rotate} disabled={rotating} accessibilityRole="button" style={styles.tool} testID="photo-rotate">
            <Icon name="refresh" size={16} color="#F1E6EA" />
            <Text variant="label" color="#F1E6EA">{t('photo.rotate')}</Text>
          </Pressable>
          <Pressable onPress={() => setWhole(!whole)} accessibilityRole="button" accessibilityState={{ selected: whole }} style={[styles.tool, whole && styles.toolOn]} testID="photo-fit">
            <Icon name="image" size={16} color={whole ? colors.emerald : '#F1E6EA'} />
            <Text variant="label" color={whole ? colors.emerald : '#F1E6EA'}>{whole ? t('photo.fill') : t('photo.fit')}</Text>
          </Pressable>
        </View>
        <View style={styles.foot}>
          <Button
            label={t('photo.use')}
            kind="gold"
            icon={<Icon name="check" size={18} color={colors.emerald} />}
            onPress={() => onUse(img, whole || !frame.width ? undefined : cropFor(img, frame, view))}
            loading={busy || rotating}
            full
            testID="photo-use"
          />
          <Button label={t('photo.different')} kind="light" onPress={onChooseAnother} full testID="photo-different" />
        </View>
        {asking ? (
          <View style={styles.scrim}>
            <View style={styles.ask} testID="photo-discard-ask">
              <Text variant="h3">{t('photo.discardTitle')}</Text>
              <Text variant="body" color={colors.muted}>{t('photo.discardBody')}</Text>
              <Button label={t('photo.discard')} kind="danger" onPress={onCancel} full testID="photo-discard" />
              <Button label={t('photo.keep')} kind="secondary" onPress={() => setAsking(false)} full />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#141015' },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  x: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: { overflow: 'hidden', borderRadius: radius.sm, borderWidth: 2, borderColor: colors.white, backgroundColor: '#000' },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  ask: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.lg, padding: space.xl, gap: space.sm },
  gl: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  gh: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  tools: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingVertical: space.md, flexWrap: 'wrap' },
  tool: { height: 40, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: '#2A2229', flexDirection: 'row', alignItems: 'center', gap: 6 },
  toolOn: { backgroundColor: colors.goldSoft },
  foot: { paddingHorizontal: space.xl, gap: space.sm, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
