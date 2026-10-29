import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors } from '@/theme/tokens';
import { Text } from './ui/Text';

/** Circular progress with the percentage in the middle; fills smoothly (instantly under Reduce Motion). */
export function ProgressRing({ percent, size = 64, stroke = 6, label }: { percent: number; size?: number; stroke?: number; label: string }) {
  const reduced = useReducedMotion();
  const target = Math.max(0, Math.min(100, Math.round(percent)));
  const [animated, setShown] = useState(0);
  const shown = reduced ? target : animated;
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const id = v.addListener(({ value }) => setShown(Math.round(value)));
    const a = Animated.timing(v, { toValue: target, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => {
      a.stop();
      v.removeListener(id);
    };
  }, [target, reduced, v]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: target }} aria-valuenow={target} aria-valuemin={0} aria-valuemax={100}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.sage} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.emerald} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - shown / 100)} />
      </Svg>
      <Text variant="bodyStrong" color={colors.emerald} style={{ fontSize: size > 56 ? 16 : 13 }}>
        {`${shown}%`}
      </Text>
    </View>
  );
}
