import { describe, expect, it } from 'vitest';
import { fitScale, pageDimensions } from './pdf';

describe('pdf viewer geometry helpers', () => {
  it('swaps page dimensions on 90 and 270 degree rotations', () => {
    expect(pageDimensions(612, 792, 0)).toEqual({ width: 612, height: 792 });
    expect(pageDimensions(612, 792, 90)).toEqual({ width: 792, height: 612 });
    expect(pageDimensions(612, 792, 180)).toEqual({ width: 612, height: 792 });
    expect(pageDimensions(612, 792, 270)).toEqual({ width: 792, height: 612 });
  });

  it('computes bounded fit width and fit page scales', () => {
    const widthScale = fitScale(612, 792, 1000, 800, 'width');
    expect(widthScale).toBeCloseTo((1000 - 64) / 612, 4);

    const pageScale = fitScale(612, 792, 1000, 800, 'page');
    expect(pageScale).toBeCloseTo((800 - 48) / 792, 4);

    expect(fitScale(10, 10, 10000, 10000, 'width')).toBe(3);
    expect(fitScale(50000, 50000, 200, 200, 'page')).toBe(0.1);
  });
});
