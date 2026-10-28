import { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/**
 * Small inline SVG icon set (no icon-font download → faster first paint, works offline).
 * Stroke icons on a 24×24 grid.
 */
export type IconName =
  | 'heart' | 'heartFilled' | 'search' | 'filter' | 'bell' | 'user' | 'users' | 'mail' | 'chevronLeft' | 'chevronRight'
  | 'chevronDown' | 'close' | 'check' | 'camera' | 'lock' | 'shield' | 'globe' | 'settings' | 'star' | 'eye' | 'phone'
  | 'flag' | 'ban' | 'plus' | 'pause' | 'play' | 'sparkle' | 'home' | 'chart';

const PATHS: Record<IconName, string> = {
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  heartFilled: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2-4-4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zm4 4h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9a3 3 0 1 0 0-6m2 15a5 5 0 0 0-3-4.6',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17l9-10',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.5 7.5 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  plus: 'M12 5v14M5 12h14',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 5l12 7-12 7V5z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z',
  home: 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H3',
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const Icon = memo(function Icon({ name, size = 22, color = colors.emerald, strokeWidth = 1.8 }: IconProps) {
  const filled = name === 'heartFilled';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={PATHS[name]} stroke={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
});

/** Decorative 8-point star motif used in cards & placeholders. */
export const StarMotif = memo(function StarMotif({ size = 40, color = colors.gold, opacity = 1 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" opacity={opacity}>
      <Rect x="9" y="9" width="22" height="22" stroke={color} strokeWidth="1.4" fill="none" />
      <Rect x="9" y="9" width="22" height="22" stroke={color} strokeWidth="1.4" fill="none" transform="rotate(45 20 20)" />
      <Circle cx="20" cy="20" r="4" stroke={color} strokeWidth="1.4" fill="none" />
    </Svg>
  );
});
