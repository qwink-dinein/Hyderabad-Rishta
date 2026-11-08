import { useCallback, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors } from '@/theme/tokens';

/**
 * Landing-screen background video (owner 2026-11-08, "like Muzz"): a muted ~7 s loop of three wedding moments
 * (assets/hero/hero-loop.mp4, 608×1080 H.264, ~1.1 MB; the same loop as the website hero) under a burgundy veil.
 * - The poster (its first frame) shows until the video is actually playing, so there is never a black box.
 * - Reduced motion: poster only. Muted and mixed with other audio, so a member's music keeps playing.
 * - Plays only while the screen is focused.
 */
const LOOP = require('../../assets/hero/hero-loop.mp4');
const POSTER = require('../../assets/hero/hero-poster.webp');

// Dark under the status bar and logo, clearer through the picture, then deep burgundy behind the headline and
// solid at the foot so the text below sits on the brand colour.
const VEIL = ['rgba(63,47,72,0.62)', 'rgba(63,47,72,0.18)', 'rgba(63,47,72,0.42)', 'rgba(63,47,72,0.8)', colors.forest] as const;
const VEIL_AT = [0, 0.14, 0.42, 0.66, 1] as const;

export function HeroVideo({ style }: { style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  return (
    <View style={[styles.box, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      {reduced ? null : <Loop />}
      <LinearGradient colors={VEIL} locations={VEIL_AT} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Loop() {
  const player = useVideoPlayer(LOOP, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [shown, setShown] = useState(false);
  if (isPlaying && !shown) setShown(true);

  useFocusEffect(
    useCallback(() => {
      player.play();
      return () => player.pause();
    }, [player]),
  );

  return <VideoView player={player} style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />;
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden', backgroundColor: colors.forest },
});
