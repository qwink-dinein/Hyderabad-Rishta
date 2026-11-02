import { cropFor } from '@/components/PhotoAdjust';

/** The adjust screen's framing → the exact part of the picture kept (owner-approved design 2026-11-02). */
describe('photo adjust: crop maths', () => {
  const frame = { width: 300, height: 375 }; // 4:5
  it('no zoom, centred: the largest 4:5 area in the middle of the picture', () => {
    const c = cropFor({ width: 1200, height: 1200 }, frame, { zoom: 1, x: 0, y: 0 });
    expect(c.width).toBeCloseTo(960);
    expect(c.height).toBeCloseTo(1200);
    expect(c.originX).toBeCloseTo(120);
    expect(c.originY).toBeCloseTo(0);
  });
  it('zoom 2: half the size, still centred', () => {
    const c = cropFor({ width: 1200, height: 1200 }, frame, { zoom: 2, x: 0, y: 0 });
    expect(c.width).toBeCloseTo(480);
    expect(c.height).toBeCloseTo(600);
    expect(c.originX).toBeCloseTo(360);
    expect(c.originY).toBeCloseTo(300);
  });
  it('dragged to the left edge, and never outside the picture', () => {
    const c = cropFor({ width: 1200, height: 1200 }, frame, { zoom: 1, x: 9999, y: 0 });
    expect(c.originX).toBe(0);
    const d = cropFor({ width: 1200, height: 1200 }, frame, { zoom: 1, x: -9999, y: 0 });
    expect(d.originX + d.width).toBeCloseTo(1200);
  });
});
