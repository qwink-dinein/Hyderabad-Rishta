import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/**
 * Original vector artwork for Hyderabad Rishta (Design PRD §2.4, §4.3).
 * No photographs of real people → no licensing or consent issues; scales crisply on every screen.
 * All pieces share one grade: dark forest surround, dusk-gold sky, champagne-gold line work.
 */

const GOLD = colors.gold;
const FOREST = colors.forest;
const SKY_TOP = '#16493C';
const SKY_GLOW = '#E9C98A';

/** Brand medallion: 8-point star with an inner rosette. */
export const BrandMark = memo(function BrandMark({ size = 40, color = GOLD }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect x="11" y="11" width="26" height="26" rx="2" stroke={color} strokeWidth="1.6" fill="none" />
      <Rect x="11" y="11" width="26" height="26" rx="2" stroke={color} strokeWidth="1.6" fill="none" transform="rotate(45 24 24)" />
      <Circle cx="24" cy="24" r="7.5" stroke={color} strokeWidth="1.4" fill="none" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <Path key={a} d="M24 16.5c1.6 2.2 1.6 4.8 0 7.5c-1.6-2.7-1.6-5.3 0-7.5z" fill={color} transform={`rotate(${a} 24 24)`} opacity={0.9} />
      ))}
      <Circle cx="24" cy="24" r="1.8" fill={color} />
    </Svg>
  );
});

/** A hanging lantern with a soft glow. Coordinates are local (0,0 = hook). */
function Lantern({ x, y, scale = 1, chain = 30 }: { x: number; y: number; scale?: number; chain?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${scale})`}>
      <Path d={`M0 0V${chain}`} stroke={GOLD} strokeWidth="1" opacity={0.8} />
      <Circle cx="0" cy={chain + 26} r="30" fill="url(#lanternGlow)" />
      <Path d={`M-7 ${chain}h14l5 8h-24z`} fill={GOLD} />
      <Path d={`M-12 ${chain + 8}h24l-3 30h-18z`} fill="#F6D896" opacity={0.95} />
      <Path d={`M-12 ${chain + 8}h24l-3 30h-18z`} stroke={colors.goldMuted} strokeWidth="1.2" fill="none" />
      <Path d={`M-4 ${chain + 8}v30M4 ${chain + 8}v30`} stroke={colors.goldMuted} strokeWidth="0.9" opacity={0.7} />
      <Path d={`M-9 ${chain + 38}h18l-4 6h-10z`} fill={GOLD} />
      <Path d={`M0 ${chain + 44}v6`} stroke={GOLD} strokeWidth="1.2" />
    </G>
  );
}

/** Small floral sprig used in corners. */
function Sprig({ x, y, flip = false, color = GOLD }: { x: number; y: number; flip?: boolean; color?: string }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} opacity={0.85}>
      <Path d="M0 0C10-14 24-20 40-22" stroke={color} strokeWidth="1.3" fill="none" />
      <Path d="M12-8c-2-8 2-13 8-14c0 7-3 12-8 14z" fill={color} opacity={0.75} />
      <Path d="M24-15c0-8 5-11 11-11c-1 6-5 10-11 11z" fill={color} opacity={0.6} />
      <Path d="M8-3c-8-2-11-7-10-12c6 1 10 5 10 12z" fill={color} opacity={0.6} />
      <Circle cx="41" cy="-23" r="2.4" fill={color} />
    </G>
  );
}

/** Charminar-inspired silhouette (Hyderabad's landmark), drawn as simple geometry. */
function Charminar({ cx, ground, color }: { cx: number; ground: number; color: string }) {
  const w = 104;
  const l = cx - w / 2;
  const r = cx + w / 2;
  const minaret = (mx: number) => (
    <G key={mx}>
      <Rect x={mx - 6} y={ground - 150} width="12" height="150" fill={color} />
      <Rect x={mx - 9} y={ground - 96} width="18" height="5" fill={color} />
      <Rect x={mx - 8.5} y={ground - 124} width="17" height="5" fill={color} />
      <Path d={`M${mx - 7} ${ground - 150}c0-12 14-12 14 0z`} fill={color} />
      <Path d={`M${mx} ${ground - 162}v-8`} stroke={color} strokeWidth="1.6" />
    </G>
  );
  return (
    <G>
      <Path d={`M${l} ${ground}V${ground - 92}H${r}V${ground}z`} fill={color} />
      <Rect x={l - 2} y={ground - 100} width={w + 4} height="8" fill={color} />
      {/* small gallery arches */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Path key={i} d={`M${l + 10 + i * 15} ${ground - 102}v-10a5 5 0 0 1 10 0v10z`} fill={color} />
      ))}
      {/* central pointed arch opening shows the sky behind */}
      <Path d={`M${cx - 26} ${ground}V${ground - 46}C${cx - 26} ${ground - 66} ${cx} ${ground - 80} ${cx} ${ground - 84}C${cx} ${ground - 80} ${cx + 26} ${ground - 66} ${cx + 26} ${ground - 46}V${ground}z`} fill="url(#sky)" opacity={0.85} />
      {minaret(l + 2)}
      {minaret(r - 2)}
    </G>
  );
}

function Domes({ ground, color }: { ground: number; color: string }) {
  return (
    <G fill={color}>
      <Path d={`M8 ${ground}v-24h44v24z`} />
      <Path d={`M12 ${ground - 24}c0-22 36-22 36 0z`} />
      <Path d={`M30 ${ground - 44}v-8`} stroke={color} strokeWidth="1.4" />
      <Path d={`M300 ${ground}v-30h48v30z`} />
      <Path d={`M304 ${ground - 30}c0-26 40-26 40 0z`} />
      <Path d={`M324 ${ground - 53}v-9`} stroke={color} strokeWidth="1.4" />
      <Rect x="282" y={ground - 70} width="7" height="70" />
      <Path d={`M280 ${ground - 70}c0-9 11-9 11 0z`} />
      <Rect x="62" y={ground - 58} width="6" height="58" />
      <Path d={`M60 ${ground - 58}c0-8 10-8 10 0z`} />
    </G>
  );
}

/** Jali (lattice) window with a crescent — the privacy slide. */
function Jali({ cx, cy }: { cx: number; cy: number }) {
  const cells = [];
  for (let r = -2; r <= 2; r++)
    for (let c = -2; c <= 2; c++)
      cells.push(<Rect key={`${r}${c}`} x={cx + c * 22 - 7} y={cy + r * 22 - 7} width="14" height="14" stroke={GOLD} strokeWidth="1.1" fill="none" transform={`rotate(45 ${cx + c * 22} ${cy + r * 22})`} opacity={0.7} />);
  return (
    <G>
      {cells}
      <Circle cx={cx} cy={cy} r="20" fill={FOREST} stroke={GOLD} strokeWidth="1.6" />
      <Path d={`M${cx - 6} ${cy + 1}h12v9h-12zM${cx - 3.5} ${cy + 1}v-4a3.5 3.5 0 0 1 7 0v4`} stroke={GOLD} strokeWidth="1.6" fill="none" />
    </G>
  );
}

export type HeroKind = 'charminar' | 'family' | 'privacy' | 'connect';

/**
 * Hero scene inside a pointed (Mughal-style) arch. viewBox 360×300, scales to any width.
 * `kind` changes the scene; frame, palette and grading stay identical across slides.
 */
export const HeroScene = memo(function HeroScene({ kind, width, height }: { kind: HeroKind; width: number; height: number }) {
  const ground = 262;
  const arch = 'M70 300V150C70 92 132 52 180 30C228 52 290 92 290 150V300z';
  return (
    <Svg width={width} height={height} viewBox="0 0 360 300" preserveAspectRatio="xMidYMid slice" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SKY_TOP} />
          <Stop offset="0.55" stopColor="#3F6A52" />
          <Stop offset="0.85" stopColor="#C9A86B" />
          <Stop offset="1" stopColor={SKY_GLOW} />
        </LinearGradient>
        <LinearGradient id="surround" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={FOREST} />
          <Stop offset="1" stopColor={colors.emerald} />
        </LinearGradient>
        <RadialGradient id="lanternGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F6D896" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#F6D896" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF1CF" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#FFF1CF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="360" height="300" fill="url(#surround)" />
      {/* faint geometric pattern on the surround */}
      <G opacity={0.08}>
        {[30, 330].map((x) => [40, 110, 180, 250].map((y) => <Rect key={`${x}-${y}`} x={x - 12} y={y - 12} width="24" height="24" stroke={GOLD} strokeWidth="1" fill="none" transform={`rotate(45 ${x} ${y})`} />))}
      </G>
      <Path d={arch} fill="url(#sky)" />
      <Circle cx="180" cy={kind === 'connect' ? 120 : 218} r="70" fill="url(#sun)" />
      {kind === 'charminar' ? (
        <G>
          <Domes ground={ground} color="#2C5A48" />
          <Charminar cx={180} ground={ground} color={FOREST} />
        </G>
      ) : null}
      {kind === 'family' ? (
        <G>
          <Domes ground={ground} color="#2C5A48" />
          {/* courtyard doorway with two figures' silhouettes kept abstract: a home and its lamps */}
          <Path d={`M128 ${ground}V170c0-26 26-44 52-54c26 10 52 28 52 54v${ground - 170}z`} fill={FOREST} />
          <Path d={`M150 ${ground}V182c0-16 16-28 30-34c14 6 30 18 30 34v${ground - 182}z`} fill="#F6D896" opacity={0.9} />
          <Path d={`M180 148v-14`} stroke={FOREST} strokeWidth="2" />
          <Circle cx="180" cy="130" r="4" fill={FOREST} />
          <Lantern x={164} y={150} scale={0.42} chain={12} />
          <Lantern x={196} y={150} scale={0.42} chain={12} />
        </G>
      ) : null}
      {kind === 'privacy' ? (
        <G>
          <Domes ground={ground} color="#2C5A48" />
          <Path d={`M120 ${ground}V160c0-34 30-56 60-66c30 10 60 32 60 66v${ground - 160}z`} fill={FOREST} opacity={0.92} />
          <Jali cx={180} cy={196} />
        </G>
      ) : null}
      {kind === 'connect' ? (
        <G>
          <Path d="M188 92a26 26 0 1 0 20 42a21 21 0 1 1-20-42z" fill="#FFF1CF" opacity={0.95} />
          {[[120, 80], [236, 70], [212, 110], [140, 120], [250, 140]].map(([x, y]) => (
            <Path key={`${x}${y}`} d={`M${x} ${y - 4}l1.2 2.8 2.8 1.2-2.8 1.2-1.2 2.8-1.2-2.8-2.8-1.2 2.8-1.2z`} fill="#FFF1CF" opacity={0.85} />
          ))}
          <Domes ground={ground} color="#2C5A48" />
          <Path d={`M100 ${ground}v-34h160v34z`} fill={FOREST} />
          <Path d={`M140 ${ground - 34}c0-42 80-42 80 0z`} fill={FOREST} />
          <Path d={`M180 ${ground - 66}v-12`} stroke={FOREST} strokeWidth="2" />
          <Circle cx="166" cy={ground - 14} r="9" stroke={GOLD} strokeWidth="2" fill="none" />
          <Circle cx="182" cy={ground - 14} r="9" stroke={GOLD} strokeWidth="2" fill="none" />
        </G>
      ) : null}
      {/* ground line + arch frame */}
      <Rect x="70" y={ground} width="220" height={300 - ground} fill={FOREST} />
      <Path d={arch} stroke={GOLD} strokeWidth="2.2" fill="none" />
      <Path d="M80 300V152C80 99 137 62 180 41C223 62 280 99 280 152V300" stroke={GOLD} strokeWidth="0.9" fill="none" opacity={0.55} />
      <Lantern x={40} y={0} scale={0.9} chain={36} />
      <Lantern x={320} y={0} scale={0.9} chain={36} />
      <Sprig x={78} y={296} />
      <Sprig x={282} y={296} flip />
    </Svg>
  );
});

/** Mosque dome with lanterns — used at the top of the login / OTP screens. */
export const DomeArt = memo(function DomeArt({ size = 120, lantern = false }: { size?: number; lantern?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colors.goldSoft} stopOpacity="1" />
          <Stop offset="1" stopColor={colors.goldSoft} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id="dome" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.emeraldSoft} />
          <Stop offset="1" stopColor={colors.emerald} />
        </LinearGradient>
        <RadialGradient id="lanternGlow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#F6D896" stopOpacity="0.6" />
          <Stop offset="1" stopColor="#F6D896" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="60" cy="64" r="56" fill="url(#halo)" />
      {lantern ? (
        <G>
          <Lantern x={60} y={0} scale={1.3} chain={22} />
          <Lantern x={28} y={14} scale={0.6} chain={20} />
          <Lantern x={92} y={14} scale={0.6} chain={20} />
        </G>
      ) : (
        <G>
          <Path d="M60 22v-10" stroke={colors.goldMuted} strokeWidth="1.6" />
          <Path d="M60 9a3 3 0 1 0 2.2 5a2.4 2.4 0 1 1-2.2-5z" fill={colors.goldMuted} />
          <Path d="M32 62c0-22 14-34 28-40c14 6 28 18 28 40z" fill="url(#dome)" />
          <Rect x="28" y="62" width="64" height="40" fill={colors.emerald} />
          <Rect x="26" y="60" width="68" height="5" rx="1" fill={colors.goldMuted} />
          {[38, 54, 70].map((x) => (
            <Path key={x} d={`M${x} 102V84a6 6 0 0 1 12 0v18z`} fill={colors.goldSoft} />
          ))}
          <Rect x="12" y="44" width="7" height="58" fill={colors.emerald} />
          <Path d="M10.5 44c0-8 10-8 10 0z" fill={colors.emeraldSoft} />
          <Rect x="101" y="44" width="7" height="58" fill={colors.emerald} />
          <Path d="M99.5 44c0-8 10-8 10 0z" fill={colors.emeraldSoft} />
          <Rect x="6" y="101" width="108" height="3" rx="1.5" fill={colors.goldMuted} opacity={0.6} />
        </G>
      )}
    </Svg>
  );
});

/** Subtle corner flourish for light screens (kept out of forms and filters, per §2.4). */
export const CornerFlourish = memo(function CornerFlourish({ size = 120, flip = false, color = GOLD }: { size?: number; flip?: boolean; color?: string }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 120 72" style={flip ? { transform: [{ scaleX: -1 }] } : undefined} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G opacity={0.55}>
        <Sprig x={6} y={70} color={color} />
        <Path d="M6 70c18-30 50-46 96-50" stroke={color} strokeWidth="0.9" fill="none" opacity={0.6} />
      </G>
    </Svg>
  );
});

/**
 * Default portrait when a member has no photo (owner request 2026-10-29): a bride in a dupatta or a
 * groom in a safa and sherwani. Modest and faceless — no features, so it never looks like a real person.
 * Drawn bottom-anchored in a 120×140 box; the parent supplies the background.
 */
export const PersonaArt = memo(function PersonaArt({ kind, width, height }: { kind: 'bride' | 'groom'; width: number; height: number }) {
  const skin = '#E3B993';
  return (
    <Svg width={width} height={height} viewBox="0 0 120 140" preserveAspectRatio="xMidYMax meet" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'bride' ? (
        <G>
          {/* dupatta: covers the head and falls over the shoulders */}
          <Path d="M60 16C37 16 27 35 27 58c0 12 2 22-3 33C15 100 7 113 5 140h110c-2-27-10-40-19-49c-5-11-3-21-3-33c0-23-10-42-33-42z" fill="#8E2F45" />
          <Path d="M5 140c2-27 10-40 19-49c10 8 22 12 36 12s26-4 36-12c9 9 17 22 19 49z" fill="#7A2439" />
          <Ellipse cx="60" cy="61" rx="16.5" ry="20.5" fill={skin} />
          {/* gold edging around the face and along the hem */}
          <Path d="M60 37c-12 0-21 10-21 24s9 25 21 25s21-11 21-25s-9-24-21-24z" stroke={GOLD} strokeWidth="2" fill="none" />
          <Path d="M24 91c10 8 22 12 36 12s26-4 36-12" stroke={GOLD} strokeWidth="2" fill="none" />
          {[34, 47, 60, 73, 86].map((x, i) => (
            <Circle key={x} cx={x} cy={i === 0 || i === 4 ? 99 : i === 2 ? 106.5 : 104} r="1.8" fill={GOLD} />
          ))}
          {/* maang tikka */}
          <Path d="M60 37v4" stroke={GOLD} strokeWidth="1.2" />
          <Circle cx="60" cy="43.5" r="2.4" fill={GOLD} />
          <Path d="M14 140c3-14 8-22 14-28M106 140c-3-14-8-22-14-28" stroke={GOLD} strokeWidth="1" opacity={0.6} fill="none" />
        </G>
      ) : (
        <G>
          {/* sherwani with a gold band collar and buttons */}
          <Path d="M10 140c2-26 15-38 34-43l16 9l16-9c19 5 32 17 34 43z" fill={FOREST} />
          <Path d="M50 84h20v14l-10 8l-10-8z" fill={skin} />
          <Path d="M44 97l16 9l16-9" stroke={GOLD} strokeWidth="2.4" fill="none" strokeLinejoin="round" />
          <Path d="M60 106v34" stroke={GOLD} strokeWidth="1" opacity={0.7} />
          {[114, 124, 134].map((y) => (
            <Circle key={y} cx="60" cy={y} r="1.9" fill={GOLD} />
          ))}
          <Path d="M28 140c1-12 4-20 9-26M92 140c-1-12-4-20-9-26" stroke={GOLD} strokeWidth="1" opacity={0.5} fill="none" />
          <Ellipse cx="60" cy="64" rx="16.5" ry="20.5" fill={skin} />
          {/* safa (wedding turban) with a kalgi */}
          <Path d="M41 58c-3-19 8-31 19-31s22 12 19 31c-5-6-12-9-19-9s-14 3-19 9z" fill="#C9A35C" />
          <Path d="M43 50c6-5 11-7 17-7s11 2 17 7M45 41c5-3 10-5 15-5s10 2 15 5" stroke="#9C7A3C" strokeWidth="1.3" fill="none" />
          <Circle cx="60" cy="40" r="2.6" fill={colors.ivory} stroke="#9C7A3C" strokeWidth="0.8" />
          <Path d="M60 37c-1-6 1-11 5-15c-1 5-2 10-5 15z" fill={colors.ivory} stroke="#9C7A3C" strokeWidth="0.8" />
        </G>
      )}
    </Svg>
  );
});
