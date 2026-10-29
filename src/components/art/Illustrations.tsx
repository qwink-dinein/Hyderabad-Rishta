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
 * Default portrait when a member has no photo (owner request 2026-10-29, redrawn with faces the same
 * day): a bride in a dupatta or a groom in a safa and sherwani. Each profile gets its own look —
 * skin tone, outfit colours, eyes, jewellery, beard — picked from a stable seed (the profile ID), so
 * the same person always looks the same. Drawn bottom-anchored in a 120×140 box.
 */
const SKINS = [
  ['#F3CDAA', '#E2B08A'],
  ['#E6B68E', '#D19B72'],
  ['#D49F77', '#BC845D'],
  ['#BC855F', '#A06C49'],
] as const;
const HAIRS = ['#2A1C16', '#3A281F', '#1C1716', '#4A3022'];
const DUPATTAS = [
  ['#9C2F4B', '#7E2239'],
  ['#C2445E', '#9E3049'],
  ['#6E2D63', '#56214D'],
  ['#1E6B5A', '#15503F'],
  ['#C8603C', '#A4492A'],
] as const;
const BLOUSES = ['#D9B062', '#E8C987', '#B8364F', '#2F5C4D'];
const LIPS = ['#B4485C', '#C45E6C', '#A33B50', '#B9545A'];
const SHERWANIS = [
  ['#1F4A3E', '#163A30'],
  ['#6A2638', '#521C2B'],
  ['#2E3D5C', '#222E47'],
  ['#E9DCC0', '#D2C29F'],
  ['#5B4632', '#463424'],
] as const;
const SAFAS = [
  ['#D2A852', '#A9832F'],
  ['#B2384E', '#8C2638'],
  ['#E8D6A8', '#C4AE78'],
  ['#C8603C', '#A4492A'],
] as const;
const INK = '#3A2620';

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return <T,>(list: readonly T[], salt: number) => list[Math.abs(Math.imul(h ^ (salt * 0x9e3779b1), 2654435761) >>> 7) % list.length];
}

/** Eyes, brows, nose, blush, mouth — shared by both portraits (face centred on 60,`cy`). */
function Face({ cy, closed, lips, brow, shade, smile }: { cy: number; closed: boolean; lips?: string; brow: number; shade: string; smile: boolean }) {
  const ey = cy + 1;
  return (
    <G>
      <Path d={`M49.5 ${ey - 5.2}q4.2-2.8 8.4-0.6M62.1 ${ey - 5.8}q4.2-2.2 8.4 0.6`} stroke={INK} strokeWidth={brow} strokeLinecap="round" fill="none" />
      {closed ? (
        <Path d={`M51 ${ey}q3.2 2.4 6.4 0M62.6 ${ey}q3.2 2.4 6.4 0`} stroke={INK} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      ) : (
        <G>
          <Path d={`M50.6 ${ey}q3.6-3 7.2 0q-3.6 2.5-7.2 0zM62.2 ${ey}q3.6-3 7.2 0q-3.6 2.5-7.2 0z`} fill="#FFFDF8" />
          <Circle cx="54.3" cy={ey - 0.2} r="1.9" fill="#3B2418" />
          <Circle cx="65.8" cy={ey - 0.2} r="1.9" fill="#3B2418" />
          <Circle cx="54.9" cy={ey - 0.8} r="0.55" fill="#FFFFFF" />
          <Circle cx="66.4" cy={ey - 0.8} r="0.55" fill="#FFFFFF" />
          <Path d={`M50.2 ${ey + 0.1}q3.9-3.5 7.8-0.2M61.9 ${ey - 0.1}q3.9-3.3 7.8 0.2`} stroke={INK} strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </G>
      )}
      <Path d={`M60.3 ${ey + 2}q-1.6 4.4 0 5.6q1.1 0.5 2-0.3`} stroke={shade} strokeWidth="1" strokeLinecap="round" fill="none" />
      <Circle cx="51.5" cy={ey + 6} r="3.2" fill="#E88A8A" opacity={0.22} />
      <Circle cx="68.5" cy={ey + 6} r="3.2" fill="#E88A8A" opacity={0.22} />
      {lips ? (
        <Path d={`M56 ${ey + 10.4}q2-1.5 4 0q2-1.5 4 0q-1.6 3.4-4 3.4q-2.4 0-4-3.4z`} fill={lips} />
      ) : (
        <Path d={smile ? `M56.4 ${ey + 10.6}q3.6 2.8 7.2 0` : `M56.8 ${ey + 11}q3.2 1.2 6.4 0`} stroke="#8A4A40" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      )}
    </G>
  );
}

export const PersonaArt = memo(function PersonaArt({ kind, seed, width, height }: { kind: 'bride' | 'groom'; seed: string; width: number; height: number }) {
  const pick = seeded(seed + kind);
  const [skin, shade] = pick(SKINS, 1);
  const hair = pick(HAIRS, 2);
  const closed = pick([false, false, true], 3);
  if (kind === 'bride') {
    const [dup, dupDark] = pick(DUPATTAS, 4);
    const blouse = pick(BLOUSES, 5);
    const lips = pick(LIPS, 6);
    const nath = pick([false, true, false], 7);
    const hood = 'M60 32C40 32 33 47 34 63C35 76 36 84 30 95C40 101 50 104 60 104C70 104 80 101 90 95C84 84 85 76 86 63C87 47 80 32 60 32Z';
    const opening = 'M60 40.5C48.5 40.5 43 49 43 60.5C43 73 49.5 85 60 85C70.5 85 77 73 77 60.5C77 49 71.5 40.5 60 40.5Z';
    return (
      <Svg width={width} height={height} viewBox="0 0 120 140" preserveAspectRatio="xMidYMax meet" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M6 140C8 114 20 102 40 97h40c20 5 32 17 34 43z" fill={blouse} />
        <Path d="M25 100C18 109 11 121 9 140h21c2-16 8-28 17-36zM95 100c7 9 14 21 16 40H90c-2-16-8-28-17-36z" fill={dup} />
        <Path d="M25 100C18 109 11 121 9 140M95 100c7 9 14 21 16 40" stroke={GOLD} strokeWidth="2" fill="none" />
        <G transform="translate(60 64) scale(1.18) translate(-60 -64)">
        <Path d="M53.5 76h13v24h-13z" fill={shade} />
        <Ellipse cx="60" cy="61" rx="17.5" ry="21.5" fill={hair} />
        <Ellipse cx="60" cy="62" rx="15.2" ry="18.8" fill={skin} />
        <Path d="M44.8 60C44.3 49 51 43.5 59.4 43.6L60 46.4L60.6 43.6C69 43.5 75.7 49 75.2 60C72.5 53 67 49.4 60.6 49.6L60 51L59.4 49.6C53 49.4 47.5 53 44.8 60Z" fill={hair} />
        <Face cy={62} closed={closed} lips={lips} brow={1} shade={shade} smile />
        {nath ? <Circle cx="63.2" cy="70.6" r="2.3" stroke={GOLD} strokeWidth="0.9" fill="none" /> : null}
        {/* jhumkas */}
        {[44.6, 75.4].map((x) => (
          <G key={x}>
            <Path d={`M${x} 66v3`} stroke={GOLD} strokeWidth="0.9" />
            <Path d={`M${x - 2.6} 74.2q2.6-6 5.2 0z`} fill={GOLD} />
            <Circle cx={x} cy="75.4" r="0.9" fill={GOLD} />
          </G>
        ))}
        <Path d={`${hood}${opening}`} fill={dup} fillRule="evenodd" />
        <Path d="M30 95C40 101 50 104 60 104C70 104 80 101 90 95" stroke={dupDark} strokeWidth="1.2" fill="none" opacity={0.6} />
        <Path d={opening} stroke={GOLD} strokeWidth="1.8" fill="none" />
        {[[40.5, 52], [39.6, 63], [40.6, 74], [79.5, 52], [80.4, 63], [79.4, 74]].map(([x, y]) => (
          <Circle key={`${x}${y}`} cx={x} cy={y} r="1" fill={GOLD} opacity={0.9} />
        ))}
        {/* maang tikka */}
        <Path d="M60 40.5v5" stroke={GOLD} strokeWidth="1" />
        <Circle cx="60" cy="46.6" r="2" fill={GOLD} />
        <Circle cx="60" cy="46.6" r="0.8" fill="#C2445E" />
        </G>
        {/* necklace */}
        <Path d="M46 113q14 10 28 0" stroke={GOLD} strokeWidth="1.8" fill="none" />
        <Path d="M57.4 118.4l2.6 4.4l2.6-4.4z" fill={GOLD} />
      </Svg>
    );
  }
  const [sher, sherDark] = pick(SHERWANIS, 4);
  const [safa, safaDark] = pick(SAFAS, 5);
  const beard = pick(['none', 'short', 'full', 'full'], 6);
  const stole = pick([true, false], 7);
  const smile = pick([true, true, false], 8);
  return (
    <Svg width={width} height={height} viewBox="0 0 120 140" preserveAspectRatio="xMidYMax meet" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M6 140C8 113 22 101 42 96l18 8l18-8c20 5 34 17 36 44z" fill={sher} />
      <Path d="M60 104v36" stroke={sherDark} strokeWidth="1.2" />
      {[114, 123, 132].map((y) => (
        <Circle key={y} cx="60" cy={y} r="1.8" fill={GOLD} />
      ))}
      {stole ? <Path d="M78 96c14 4 26 16 30 44H94c-2-18-9-31-20-39z" fill={GOLD} opacity={0.85} /> : null}
      <Path d="M53 77h14v22l-7 5l-7-5z" fill={shade} />
      <Path d="M44 96l16 8l16-8v4.5l-16 8l-16-8z" fill={GOLD} />
      <G transform="translate(60 70) scale(1.2) translate(-60 -70)">
      <Ellipse cx="44.6" cy="64.5" rx="2.4" ry="3.8" fill={shade} />
      <Ellipse cx="75.4" cy="64.5" rx="2.4" ry="3.8" fill={shade} />
      <Ellipse cx="60" cy="63.5" rx="15.6" ry="19.2" fill={skin} />
      <Path d="M44.6 60c0-4 1-7 2.5-9l1.4 9zM75.4 60c0-4-1-7-2.5-9l-1.4 9z" fill={hair} />
      {beard !== 'none' ? (
        <G opacity={beard === 'short' ? 0.55 : 1}>
          <Path d="M44.8 64C45.2 76.5 51.2 85.5 60 85.5S74.8 76.5 75.2 64C73.4 70.5 70 74.6 66 75.8C63 74.8 57 74.8 54 75.8C50 74.6 46.6 70.5 44.8 64Z" fill={hair} />
          <Path d="M54.2 72.6q5.8-3 11.6 0q-5.8 1.4-11.6 0z" fill={hair} />
        </G>
      ) : null}
      <Face cy={63} closed={closed} brow={1.7} shade={shade} smile={smile} />
      {/* safa with folds, brooch and kalgi */}
      <Path d="M41.8 58.5C38.6 40 48 29.5 60 29.5S81.4 40 78.2 58.5C73 52.4 66.8 49.6 60 49.6S47 52.4 41.8 58.5Z" fill={safa} />
      <Path d="M43.5 50.5C51 42.5 65 38.5 76.6 46.5M43 43.5C50 36 62 33 73.6 38M46.5 54C54 48 64 46.5 72 49" stroke={safaDark} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <Path d="M60 42c-2-7.5 0-14.5 6.5-20c-1.6 7.5-3 14-6.5 20z" fill={colors.ivory} stroke={GOLD} strokeWidth="0.8" />
      <Circle cx="60" cy="44.5" r="3.4" fill={GOLD} />
      <Circle cx="60" cy="44.5" r="1.5" fill="#B2384E" />
      </G>
    </Svg>
  );
});
