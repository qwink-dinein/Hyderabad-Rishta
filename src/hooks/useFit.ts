import { useWindowDimensions } from 'react-native';

/**
 * How much vertical room the phone has, so screens can tighten their spacing and fit without scrolling
 * on smaller Android phones (owner request 2026-11-02). `short` ≈ most budget/mid Android phones once
 * the status and navigation bars are taken off; `tiny` ≈ older 16:9 phones.
 */
export function useFit() {
  const { height } = useWindowDimensions();
  const short = height < 780;
  const tiny = height < 680;
  /** Scale a spacing value down on shorter screens. */
  const sp = (n: number) => (tiny ? Math.round(n * 0.55) : short ? Math.round(n * 0.75) : n);
  return { height, short, tiny, sp };
}
