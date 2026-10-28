import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, motion, space } from '@/theme/tokens';
import { HeroScene, type HeroKind } from './art/Illustrations';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/**
 * Landing hero carousel (Design PRD §4.1–4.3).
 * Original arch-framed artwork (no stock photos of real people). Swipeable, discreet progress dots,
 * manual prev/next, ~6 s autoplay that pauses on interaction, when the app is backgrounded,
 * and entirely when Reduce Motion is on. No sound, no video, no zoom/parallax.
 */
const SLIDES: { key: 's1' | 's2' | 's3' | 's4'; art: HeroKind }[] = [
  { key: 's1', art: 'charminar' },
  { key: 's2', art: 'family' },
  { key: 's3', art: 'privacy' },
  { key: 's4', art: 'connect' },
];

export const HeroCarousel = memo(function HeroCarousel() {
  const { t } = useTranslation();
  const { height: screenH, width: screenW } = useWindowDimensions();
  // Short or narrow phones: smaller art and headline so the sign-up and log-in actions stay in the first screen.
  const compact = screenH < 800 || screenW < 360;
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [foreground, setForeground] = useState(true);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      setReduceMotion(v);
      if (v) setPlaying(false);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduceMotion(v);
      if (v) setPlaying(false);
    });
    const app = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => {
      sub.remove();
      app.remove();
    };
  }, []);

  const go = useCallback(
    (next: number) => {
      const n = (next + SLIDES.length) % SLIDES.length;
      setIndex(n);
      scroller.current?.scrollTo({ x: n * width, animated: !reduceMotion });
    },
    [width, reduceMotion],
  );

  useEffect(() => {
    if (!playing || !foreground || !width) return;
    const id = setTimeout(() => go(index + 1), motion.autoplay);
    return () => clearTimeout(id);
  }, [playing, foreground, index, width, go]);

  const userGo = (n: number) => {
    setPlaying(false); // the user took control → stop auto-advance
    go(n);
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== index) setIndex(Math.max(0, Math.min(SLIDES.length - 1, n)));
  };

  // Scene ≈ 30% of the viewport; with the text block the hero fills ~45% (PRD §4.1-B).
  const sceneH = compact ? Math.round(Math.max(130, screenH * 0.2)) : Math.round(Math.max(190, Math.min(330, screenH * 0.3)));
  const slide = SLIDES[index];

  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} accessibilityLabel={t('landing.carouselLabel')}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setPlaying(false)}
        onMomentumScrollEnd={onScrollEnd}
        onScroll={onScrollEnd}
        scrollEventThrottle={64}
        style={{ height: sceneH }}
        accessible={false}
      >
        {width
          ? SLIDES.map((s) => (
              <View key={s.key} style={{ width, height: sceneH }} accessibilityElementsHidden={s.key !== slide.key} importantForAccessibility={s.key === slide.key ? 'auto' : 'no-hide-descendants'}>
                <HeroScene kind={s.art} width={width} height={sceneH} />
              </View>
            ))
          : null}
      </ScrollView>

      <View style={[styles.copy, compact && styles.copyCompact]} accessibilityLiveRegion={playing ? 'none' : 'polite'}>
        <Text variant={compact ? 'h1' : 'display'} color={colors.ivory} center accessibilityRole="header">
          {t(`landing.slides.${slide.key}.title`)}
        </Text>
        <Text variant={compact ? 'caption' : 'body'} color={colors.sage} center style={{ maxWidth: 440, opacity: 0.92 }}>
          {t(`landing.slides.${slide.key}.sub`)}
        </Text>
      </View>

      <View style={styles.controls}>
        {compact ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('landing.prevSlide')} onPress={() => userGo(index - 1)} style={styles.ctrl} hitSlop={8}>
            <Icon name="chevronLeft" color={colors.ivory} size={16} />
          </Pressable>
        )}
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityLabel={t('landing.goToSlide', { n: i + 1 })}
              accessibilityState={{ selected: i === index }}
              aria-selected={i === index}
              onPress={() => userGo(i)}
              style={styles.dotHit}
            >
              <View style={[styles.dot, i === index && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
        {compact ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={t('landing.nextSlide')} onPress={() => userGo(index + 1)} style={styles.ctrl} hitSlop={8}>
            <Icon name="chevronRight" color={colors.ivory} size={16} />
          </Pressable>
        )}
        {!reduceMotion ? (
          <Pressable accessibilityRole="button" accessibilityLabel={playing ? t('landing.pause') : t('landing.play')} onPress={() => setPlaying((p) => !p)} style={styles.ctrl} hitSlop={8}>
            <Icon name={playing ? 'pause' : 'play'} color={colors.ivory} size={14} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  copy: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl, marginTop: space.lg, minHeight: 150, justifyContent: 'flex-start' },
  copyCompact: { minHeight: 0, marginTop: space.md, gap: space.xs, paddingHorizontal: space.lg },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, marginTop: space.md },
  ctrl: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(248,244,235,0.3)', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center' },
  // 24×24 tap area around each small dot (web ignores hitSlop).
  dotHit: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(248,244,235,0.35)' },
  dotOn: { width: 22, backgroundColor: colors.gold },
});
