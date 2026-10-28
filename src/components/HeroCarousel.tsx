import { memo, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { colors, radius, space } from '@/theme/tokens';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/**
 * Landing carousel. Imagery is original vector art (arches, jali, crescent, lanterns) —
 * no stock photos of real people. Swap in licensed nikah photography later via `image` (see design.md).
 * Auto-advances, pauses on interaction, and never animates when Reduce Motion is on.
 */
const SLIDES = [
  { key: 's1', grad: ['#123D32', '#1D5546'] as const, art: 'nikah' },
  { key: 's2', grad: ['#1A4A3D', '#123D32'] as const, art: 'family' },
  { key: 's3', grad: ['#123D32', '#0E3128'] as const, art: 'privacy' },
  { key: 's4', grad: ['#16473A', '#123D32'] as const, art: 'search' },
] as const;

const G1 = colors.gold;

function Art({ kind, size }: { kind: string; size: number }) {
  const s = size;
  switch (kind) {
    case 'nikah':
      return (
        <Svg width={s} height={s} viewBox="0 0 200 200">
          <Path d="M40 190V95a60 60 0 0 1 120 0v95" stroke={G1} strokeWidth="2" fill="none" />
          <Path d="M58 190V100a42 42 0 0 1 84 0v90" stroke={G1} strokeWidth="1.2" fill="none" opacity={0.6} />
          <Path d="M100 30a14 14 0 1 0 10 24 11 11 0 1 1-10-24z" fill={G1} />
          <G opacity={0.9}>
            <Path d="M30 40v22M170 40v22" stroke={G1} strokeWidth="1" />
            <Path d="M24 62h12l-2 16h-8zM164 62h12l-2 16h-8z" stroke={G1} strokeWidth="1.4" fill="none" />
          </G>
          <Circle cx="86" cy="150" r="11" stroke={G1} strokeWidth="1.6" fill="none" />
          <Circle cx="112" cy="150" r="11" stroke={G1} strokeWidth="1.6" fill="none" />
        </Svg>
      );
    case 'family':
      return (
        <Svg width={s} height={s} viewBox="0 0 200 200">
          <Path d="M30 180V90l70-50 70 50v90" stroke={G1} strokeWidth="2" fill="none" />
          <Circle cx="78" cy="112" r="12" stroke={G1} strokeWidth="1.6" fill="none" />
          <Path d="M58 168a20 20 0 0 1 40 0" stroke={G1} strokeWidth="1.6" fill="none" />
          <Circle cx="122" cy="112" r="12" stroke={G1} strokeWidth="1.6" fill="none" />
          <Path d="M102 168a20 20 0 0 1 40 0" stroke={G1} strokeWidth="1.6" fill="none" />
          <Circle cx="100" cy="134" r="8" stroke={G1} strokeWidth="1.4" fill="none" opacity={0.8} />
          <Path d="M88 168a12 12 0 0 1 24 0" stroke={G1} strokeWidth="1.4" fill="none" opacity={0.8} />
        </Svg>
      );
    case 'privacy':
      return (
        <Svg width={s} height={s} viewBox="0 0 200 200">
          <Rect x="50" y="50" width="100" height="100" stroke={G1} strokeWidth="1.6" fill="none" />
          <Rect x="50" y="50" width="100" height="100" stroke={G1} strokeWidth="1.6" fill="none" transform="rotate(45 100 100)" />
          <Rect x="78" y="96" width="44" height="36" rx="6" stroke={G1} strokeWidth="2" fill="none" />
          <Path d="M86 96v-10a14 14 0 0 1 28 0v10" stroke={G1} strokeWidth="2" fill="none" />
          <Circle cx="100" cy="113" r="4" fill={G1} />
        </Svg>
      );
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 200 200">
          <Path d="M45 185V90a55 55 0 0 1 110 0v95z" stroke={G1} strokeWidth="2" fill="none" />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2].map((c) => (
              <Rect key={`${r}-${c}`} x={62 + c * 26} y={98 + r * 21} width="14" height="14" stroke={G1} strokeWidth="1" fill="none" transform={`rotate(45 ${69 + c * 26} ${105 + r * 21})`} opacity={0.75} />
            )),
          )}
          <Circle cx="140" cy="60" r="16" stroke={G1} strokeWidth="2" fill="none" />
          <Path d="m152 72 14 14" stroke={G1} strokeWidth="2.4" strokeLinecap="round" />
        </Svg>
      );
  }
}

export const HeroCarousel = memo(function HeroCarousel() {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      setReduceMotion(v);
      if (v) setPlaying(false);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduceMotion(v);
      if (v) setPlaying(false);
    });
    return () => sub.remove();
  }, []);

  const go = useCallback(
    (next: number) => {
      const n = (next + SLIDES.length) % SLIDES.length;
      if (reduceMotion) return setIndex(n);
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIndex(n);
        Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
      });
    },
    [fade, reduceMotion],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => go(index + 1), 5500);
    return () => clearInterval(id);
  }, [playing, index, go]);

  const slide = SLIDES[index];
  const artSize = Math.min(220, width * 0.5);
  const userGo = (n: number) => {
    setPlaying(false); // user took control → stop auto-advance
    go(n);
  };

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={slide.grad} style={styles.slide}>
        <Animated.View style={[styles.slideInner, { opacity: fade }]} accessibilityLiveRegion={playing ? 'none' : 'polite'}>
          <Art kind={slide.art} size={artSize} />
          <Text variant="h1" color={colors.ivory} center>
            {t(`landing.slides.${slide.key}.title`)}
          </Text>
          <Text variant="body" color={colors.sage} center style={{ maxWidth: 420 }}>
            {t(`landing.slides.${slide.key}.sub`)}
          </Text>
        </Animated.View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('landing.prevSlide')} onPress={() => userGo(index - 1)} style={styles.ctrl} hitSlop={6}>
            <Icon name="chevronLeft" color={colors.ivory} size={18} />
          </Pressable>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                accessibilityLabel={t('landing.goToSlide', { n: i + 1 })}
                accessibilityState={{ selected: i === index }}
                onPress={() => userGo(i)}
                hitSlop={8}
                style={[styles.dot, i === index && styles.dotOn]}
              />
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('landing.nextSlide')} onPress={() => userGo(index + 1)} style={styles.ctrl} hitSlop={6}>
            <Icon name="chevronRight" color={colors.ivory} size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? t('landing.pause') : t('landing.play')}
            onPress={() => setPlaying((p) => !p)}
            style={styles.ctrl}
            hitSlop={6}
          >
            <Icon name={playing ? 'pause' : 'play'} color={colors.ivory} size={16} />
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.xl, overflow: 'hidden' },
  slide: { paddingVertical: space.xxl, paddingHorizontal: space.xl, minHeight: 420, justifyContent: 'space-between' },
  slideInner: { alignItems: 'center', gap: space.md },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, marginTop: space.xl },
  ctrl: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(248,244,235,0.35)', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(248,244,235,0.4)' },
  dotOn: { width: 22, backgroundColor: colors.gold },
});
