import { memo } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/** Line drawing of the Charminar's façade in antique gold (welcome screen). Decorative only. */
export const Charminar = memo(function Charminar({ width = 290, color = colors.gold, opacity = 0.75 }: { width?: number; color?: string; opacity?: number }) {
  const minaret = (
    <G>
      <Path d="M30 228V70M52 228V70M27 70h28M29 62h24l-3-6H32zM33 56c0-14 3-22 8-28c5 6 8 14 8 28M41 28v-8M27 120h28M27 170h28M26 116h30M26 166h30" />
    </G>
  );
  return (
    <Svg width={width} height={(width * 230) / 300} viewBox="0 0 300 230" fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {minaret}
      <G transform="translate(218 0)">{minaret}</G>
      <Path d="M52 228V110h196v118M52 110h196M48 104h204v6H48z" />
      <Path d="M112 228v-70c0-24 17-40 38-40s38 16 38 40v70M122 228v-66c0-19 12-32 28-32s28 13 28 32v66" />
      <Path d="M66 150c0-10 7-17 16-17s16 7 16 17M202 150c0-10 7-17 16-17s16 7 16 17M66 150v30h32v-30M202 150v30h32v-30" />
      <Path d="M60 96h180M70 96v8M90 96v8M110 96v8M130 96v8M150 96v8M170 96v8M190 96v8M210 96v8M230 96v8" />
      <Path d="M120 96c0-12 13-20 30-20s30 8 30 20M150 76v-10" />
      <Circle cx="150" cy="63" r="3" />
      <Path d="M0 228h300" />
    </Svg>
  );
});
